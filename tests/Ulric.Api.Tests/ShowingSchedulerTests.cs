using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Ulric.Api.Data;
using Ulric.Api.Models;
using Ulric.Api.Services;

namespace Ulric.Api.Tests;

public class ShowingSchedulerTests
{
    private static readonly DateTime Day = new(2026, 10, 12, 0, 0, 0, DateTimeKind.Unspecified);

    [Fact]
    public void Overlapping_bookings_conflict_and_adjacent_ones_do_not()
    {
        var booked = new Showing
        {
            StartsAt = Day.AddHours(10).AddMinutes(30),
            EndsAt = Day.AddHours(11),
            Status = ShowingStatus.Booked
        };
        var cancelled = new Showing
        {
            StartsAt = Day.AddHours(11),
            EndsAt = Day.AddHours(11).AddMinutes(30),
            Status = ShowingStatus.Cancelled
        };
        var existing = new[] { booked, cancelled };

        Assert.True(ShowingScheduler.HasConflict(existing, Day.AddHours(10).AddMinutes(45), Day.AddHours(11).AddMinutes(15)));
        Assert.False(ShowingScheduler.HasConflict(existing, Day.AddHours(11), Day.AddHours(11).AddMinutes(30)));
        Assert.False(ShowingScheduler.HasConflict(existing, Day.AddHours(10), Day.AddHours(10).AddMinutes(30)));
    }

    [Fact]
    public void Generated_slots_mark_only_the_booked_time_unavailable()
    {
        var window = new ShowingWindow
        {
            StartsAt = Day.AddHours(10),
            EndsAt = Day.AddHours(12),
            SlotMinutes = 30
        };
        var booked = new Showing
        {
            StartsAt = Day.AddHours(10).AddMinutes(30),
            EndsAt = Day.AddHours(11),
            Status = ShowingStatus.Booked
        };

        var slots = ShowingScheduler.Generate([window], [booked], Day, Day.AddDays(1));

        Assert.Equal(4, slots.Count);
        Assert.True(slots[0].Available);
        Assert.False(slots[1].Available);
        Assert.True(slots[2].Available);
        Assert.Equal(Day.AddHours(10).AddMinutes(30), slots[1].StartsAt);
    }

    [Fact]
    public async Task Booking_the_same_slot_twice_is_rejected_until_it_is_cancelled()
    {
        await using var connection = new SqliteConnection("Data Source=:memory:");
        await connection.OpenAsync();
        var options = new DbContextOptionsBuilder<UlricDbContext>().UseSqlite(connection).Options;
        await using var db = new UlricDbContext(options);
        await db.Database.EnsureCreatedAsync();

        var listing = new Listing
        {
            Id = Guid.NewGuid(),
            Slug = "test-house",
            Status = ListingStatus.Published,
            Street = "1 Test Street",
            City = "Cedarwick",
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow
        };
        listing.ShowingWindows.Add(new ShowingWindow
        {
            Id = Guid.NewGuid(),
            StartsAt = Day.AddHours(10),
            EndsAt = Day.AddHours(11),
            SlotMinutes = 30
        });
        db.Listings.Add(listing);
        await db.SaveChangesAsync();

        var service = new BookingService(db);
        var start = Day.AddHours(10);
        var end = Day.AddHours(10).AddMinutes(30);

        var first = await service.BookAsync(listing.Id, "Helen Cho", "helen.cho@example.com", null, start, end, CancellationToken.None);
        var second = await service.BookAsync(listing.Id, "Andre Walsh", "andre.walsh@example.com", null, start, end, CancellationToken.None);
        var beside = await service.BookAsync(listing.Id, "Priya Shah", "priya.shah@example.com", null, end, Day.AddHours(11), CancellationToken.None);
        var offSlot = await service.BookAsync(listing.Id, "Jonah Peck", "jonah.peck@example.com", null, start.AddMinutes(15), end.AddMinutes(15), CancellationToken.None);

        Assert.True(first.Ok);
        Assert.Equal(409, second.Status);
        Assert.True(beside.Ok);
        Assert.Equal(400, offSlot.Status);

        first.Showing!.Status = ShowingStatus.Cancelled;
        await db.SaveChangesAsync();
        var afterCancel = await service.BookAsync(listing.Id, "Helen Cho", "helen.cho@example.com", null, start, end, CancellationToken.None);
        Assert.True(afterCancel.Ok);
    }
}
