using Microsoft.EntityFrameworkCore;
using Ulric.Api.Data;
using Ulric.Api.Models;

namespace Ulric.Api.Services;

public sealed record BookResult(bool Ok, int Status, string? Error, Showing? Showing)
{
    public static BookResult Success(Showing showing) => new(true, 201, null, showing);
    public static BookResult Fail(int status, string error) => new(false, status, error, null);
}

public sealed class BookingService(UlricDbContext db)
{
    public async Task<BookResult> BookAsync(
        Guid listingId,
        string name,
        string email,
        string? phone,
        DateTime startsAt,
        DateTime endsAt,
        CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(name))
        {
            return BookResult.Fail(400, "Add your name.");
        }

        if (!EmailAddress.IsValid(email))
        {
            return BookResult.Fail(400, "Add a valid email.");
        }

        if (endsAt <= startsAt)
        {
            return BookResult.Fail(400, "That time is not valid.");
        }

        await using var tx = await db.Database.BeginTransactionAsync(ct);
        var listing = await db.Listings
            .Include(item => item.ShowingWindows)
            .FirstOrDefaultAsync(item => item.Id == listingId && item.Status == ListingStatus.Published, ct);

        if (listing is null)
        {
            return BookResult.Fail(404, "That listing is not available.");
        }

        var bookings = await db.Showings.Where(item => item.ListingId == listingId).ToListAsync(ct);
        var slots = ShowingScheduler.Generate(listing.ShowingWindows, bookings, startsAt.Date, endsAt.Date.AddDays(1));
        var slot = slots.FirstOrDefault(item => item.StartsAt == startsAt && item.EndsAt == endsAt);
        if (slot is null)
        {
            return BookResult.Fail(400, "Pick one of the open times.");
        }

        if (!slot.Available || ShowingScheduler.HasConflict(bookings, startsAt, endsAt))
        {
            return BookResult.Fail(409, "That time was just booked. Pick another.");
        }

        var showing = new Showing
        {
            Id = Guid.NewGuid(),
            ListingId = listing.Id,
            StartsAt = startsAt,
            EndsAt = endsAt,
            VisitorName = name.Trim(),
            VisitorEmail = email.Trim(),
            VisitorPhone = (phone ?? "").Trim(),
            Status = ShowingStatus.Booked,
            CreatedAt = DateTime.UtcNow
        };

        db.Showings.Add(showing);
        await db.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);
        return BookResult.Success(showing);
    }
}

public static class EmailAddress
{
    public static bool IsValid(string? value)
    {
        if (string.IsNullOrWhiteSpace(value) || value.Length > 200 || value.Contains(' '))
        {
            return false;
        }

        try
        {
            var address = new System.Net.Mail.MailAddress(value);
            return address.Address.Equals(value.Trim(), StringComparison.OrdinalIgnoreCase);
        }
        catch (FormatException)
        {
            return false;
        }
    }
}
