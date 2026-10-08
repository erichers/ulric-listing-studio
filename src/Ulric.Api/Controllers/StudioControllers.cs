using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Ulric.Api.Contracts;
using Ulric.Api.Data;
using Ulric.Api.Models;
using Ulric.Api.Services;

namespace Ulric.Api.Controllers;

[ApiController]
[Route("api/listings")]
public sealed class ListingsController(UlricDbContext db, ListingService listings, ListingFlyer flyers) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<IReadOnlyList<ListingSummary>>> List(CancellationToken ct)
    {
        var rows = await db.Listings
            .Include(item => item.Photos)
            .Include(item => item.Leads)
            .OrderByDescending(item => item.UpdatedAt)
            .ToListAsync(ct);
        return rows.Select(ListingMapper.ToSummary).ToList();
    }

    [HttpGet("{id:guid}")]
    public async Task<ActionResult<ListingDetail>> Get(Guid id, CancellationToken ct)
    {
        var listing = await LoadAsync(id, ct);
        return listing is null ? NotFound(new ApiError("Not found", 404, "That listing is not in the studio.")) : ListingMapper.ToDetail(listing);
    }

    [HttpPost]
    public async Task<ActionResult<ListingDetail>> Create(ListingWrite input, CancellationToken ct)
    {
        var (listing, error) = await listings.SaveAsync(null, input, ct);
        if (error is not null || listing is null)
        {
            return BadRequest(new ApiError("Could not save", 400, error ?? "Could not save the listing."));
        }

        return Created($"/api/listings/{listing.Id}", ListingMapper.ToDetail(listing));
    }

    [HttpPut("{id:guid}")]
    public async Task<ActionResult<ListingDetail>> Update(Guid id, ListingWrite input, CancellationToken ct)
    {
        var existing = await LoadAsync(id, ct);
        if (existing is null)
        {
            return NotFound(new ApiError("Not found", 404, "That listing is not in the studio."));
        }

        var (listing, error) = await listings.SaveAsync(existing, input, ct);
        if (error is not null || listing is null)
        {
            return BadRequest(new ApiError("Could not save", 400, error ?? "Could not save the listing."));
        }

        return ListingMapper.ToDetail(listing);
    }

    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> Delete(Guid id, CancellationToken ct)
    {
        var listing = await db.Listings.FirstOrDefaultAsync(item => item.Id == id, ct);
        if (listing is null)
        {
            return NotFound(new ApiError("Not found", 404, "That listing is not in the studio."));
        }

        db.Listings.Remove(listing);
        await db.SaveChangesAsync(ct);
        return NoContent();
    }

    [HttpGet("{id:guid}/flyer")]
    public async Task<IActionResult> Flyer(Guid id, CancellationToken ct)
    {
        var listing = await LoadAsync(id, ct);
        if (listing is null)
        {
            return NotFound(new ApiError("Not found", 404, "That listing is not in the studio."));
        }

        var pdf = flyers.Render(listing);
        return File(pdf, "application/pdf", $"{listing.Slug}.pdf");
    }

    private Task<Listing?> LoadAsync(Guid id, CancellationToken ct) =>
        db.Listings
            .Include(item => item.Photos)
            .Include(item => item.OpenHouses)
            .Include(item => item.ShowingWindows)
            .Include(item => item.Leads)
            .FirstOrDefaultAsync(item => item.Id == id, ct);
}

[ApiController]
[Route("api/public/listings/{slug}")]
public sealed class PublicListingsController(UlricDbContext db, BookingService bookings, ILeadNotifier notifier) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<ListingDetail>> Get(string slug, CancellationToken ct)
    {
        var listing = await LoadPublishedAsync(slug, ct);
        return listing is null
            ? NotFound(new ApiError("Not found", 404, "That listing is not published."))
            : ListingMapper.ToDetail(listing);
    }

    [HttpPost("views")]
    public async Task<ActionResult<object>> View(string slug, CancellationToken ct)
    {
        var listing = await db.Listings.FirstOrDefaultAsync(item => item.Slug == slug && item.Status == ListingStatus.Published, ct);
        if (listing is null)
        {
            return NotFound(new ApiError("Not found", 404, "That listing is not published."));
        }

        listing.ViewCount += 1;
        await db.SaveChangesAsync(ct);
        return new { viewCount = listing.ViewCount };
    }

    [HttpGet("slots")]
    public async Task<ActionResult<IReadOnlyList<SlotDto>>> Slots(string slug, DateTime? from, DateTime? to, CancellationToken ct)
    {
        var listing = await db.Listings
            .Include(item => item.ShowingWindows)
            .FirstOrDefaultAsync(item => item.Slug == slug && item.Status == ListingStatus.Published, ct);
        if (listing is null)
        {
            return NotFound(new ApiError("Not found", 404, "That listing is not published."));
        }

        var start = from ?? DateTime.Today;
        var end = to ?? start.AddDays(14);
        if (end < start)
        {
            (start, end) = (end, start);
        }

        if ((end - start).TotalDays > 60)
        {
            end = start.AddDays(60);
        }

        var existing = await db.Showings.Where(item => item.ListingId == listing.Id).ToListAsync(ct);
        var slots = ShowingScheduler.Generate(listing.ShowingWindows, existing, start, end);
        return slots.Select(slot => new SlotDto(slot.StartsAt, slot.EndsAt, slot.Available)).ToList();
    }

    [HttpPost("leads")]
    public async Task<ActionResult<LeadDto>> CreateLead(string slug, LeadWrite input, CancellationToken ct)
    {
        var listing = await LoadPublishedAsync(slug, ct);
        if (listing is null)
        {
            return NotFound(new ApiError("Not found", 404, "That listing is not published."));
        }

        if (string.IsNullOrWhiteSpace(input.Name))
        {
            return BadRequest(new ApiError("Could not save", 400, "Add your name."));
        }

        if (!EmailAddress.IsValid(input.Email))
        {
            return BadRequest(new ApiError("Could not save", 400, "Add a valid email."));
        }

        if (input.Message.Length > 4000)
        {
            return BadRequest(new ApiError("Could not save", 400, "Message is too long."));
        }

        var lead = new Lead
        {
            Id = Guid.NewGuid(),
            ListingId = listing.Id,
            Name = input.Name.Trim(),
            Email = input.Email.Trim(),
            Phone = input.Phone.Trim(),
            Message = input.Message.Trim(),
            PreApproved = input.PreApproved,
            Status = LeadStatus.New,
            CreatedAt = DateTime.UtcNow,
            Listing = listing
        };
        db.Leads.Add(lead);
        await db.SaveChangesAsync(ct);
        await notifier.NotifyAsync(lead, listing, ct);
        return Created($"/api/leads/{lead.Id}", ListingMapper.ToLead(lead));
    }

    [HttpPost("showings")]
    public async Task<ActionResult<ShowingDto>> CreateShowing(string slug, ShowingWrite input, CancellationToken ct)
    {
        var listing = await db.Listings.FirstOrDefaultAsync(item => item.Slug == slug && item.Status == ListingStatus.Published, ct);
        if (listing is null)
        {
            return NotFound(new ApiError("Not found", 404, "That listing is not published."));
        }

        var result = await bookings.BookAsync(listing.Id, input.Name, input.Email, input.Phone, input.StartsAt, input.EndsAt, ct);
        if (!result.Ok || result.Showing is null)
        {
            var error = new ApiError(result.Status == 409 ? "Conflict" : "Could not book", result.Status, result.Error ?? "Could not book that time.");
            return StatusCode(result.Status, error);
        }

        result.Showing.Listing = listing;
        return Created($"/api/showings/{result.Showing.Id}", ListingMapper.ToShowing(result.Showing));
    }

    private Task<Listing?> LoadPublishedAsync(string slug, CancellationToken ct) =>
        db.Listings
            .Include(item => item.Photos)
            .Include(item => item.OpenHouses)
            .Include(item => item.ShowingWindows)
            .FirstOrDefaultAsync(item => item.Slug == slug && item.Status == ListingStatus.Published, ct);
}

[ApiController]
[Route("api/leads")]
public sealed class LeadsController(UlricDbContext db) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<IReadOnlyList<LeadDto>>> List(CancellationToken ct)
    {
        var leads = await db.Leads.Include(item => item.Listing).OrderByDescending(item => item.CreatedAt).ToListAsync(ct);
        return leads.Select(ListingMapper.ToLead).ToList();
    }

    [HttpPatch("{id:guid}")]
    public async Task<ActionResult<LeadDto>> Update(Guid id, StatusWrite input, CancellationToken ct)
    {
        var lead = await db.Leads.Include(item => item.Listing).FirstOrDefaultAsync(item => item.Id == id, ct);
        if (lead is null)
        {
            return NotFound(new ApiError("Not found", 404, "That lead is not in the studio."));
        }

        if (!ListingMapper.TryLeadStatus(input.Status, out var status))
        {
            return BadRequest(new ApiError("Could not save", 400, "Status must be new, contacted, showing, or offer."));
        }

        lead.Status = status;
        await db.SaveChangesAsync(ct);
        return ListingMapper.ToLead(lead);
    }
}

[ApiController]
[Route("api/showings")]
public sealed class ShowingsController(UlricDbContext db) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<IReadOnlyList<ShowingDto>>> List(CancellationToken ct)
    {
        var rows = await db.Showings.Include(item => item.Listing).OrderBy(item => item.StartsAt).ToListAsync(ct);
        return rows.Select(ListingMapper.ToShowing).ToList();
    }

    [HttpPatch("{id:guid}")]
    public async Task<ActionResult<ShowingDto>> Update(Guid id, StatusWrite input, CancellationToken ct)
    {
        var showing = await db.Showings.Include(item => item.Listing).FirstOrDefaultAsync(item => item.Id == id, ct);
        if (showing is null)
        {
            return NotFound(new ApiError("Not found", 404, "That showing is not in the studio."));
        }

        var status = input.Status.Trim().ToLowerInvariant();
        if (status is not ("booked" or "cancelled"))
        {
            return BadRequest(new ApiError("Could not save", 400, "Status must be booked or cancelled."));
        }

        showing.Status = status == "cancelled" ? ShowingStatus.Cancelled : ShowingStatus.Booked;
        await db.SaveChangesAsync(ct);
        return ListingMapper.ToShowing(showing);
    }

    [HttpGet("{id:guid}/calendar.ics")]
    public async Task<IActionResult> Calendar(Guid id, CancellationToken ct)
    {
        var showing = await db.Showings.Include(item => item.Listing).FirstOrDefaultAsync(item => item.Id == id, ct);
        if (showing?.Listing is null)
        {
            return NotFound(new ApiError("Not found", 404, "That showing is not in the studio."));
        }

        var body = IcsCalendar.Build(showing, showing.Listing);
        return File(System.Text.Encoding.UTF8.GetBytes(body), "text/calendar", $"showing-{showing.Id:N}.ics");
    }
}

[ApiController]
[Route("api/dashboard")]
public sealed class DashboardController(UlricDbContext db) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<DashboardDto>> Get(CancellationToken ct)
    {
        var listings = await db.Listings.Include(item => item.Photos).Include(item => item.Leads).OrderByDescending(item => item.UpdatedAt).ToListAsync(ct);
        var leads = await db.Leads.Include(item => item.Listing).OrderByDescending(item => item.CreatedAt).ToListAsync(ct);
        var showings = await db.Showings.Include(item => item.Listing).OrderBy(item => item.StartsAt).ToListAsync(ct);
        var today = DateTime.Today;
        var days = Enumerable.Range(0, 14)
            .Select(offset => today.AddDays(offset - 13))
            .Select(day => new DayCount(day.ToString("yyyy-MM-dd"), leads.Count(lead => lead.CreatedAt.Date == day)))
            .ToList();

        var upcoming = showings.Count(item => item.Status == ShowingStatus.Booked && item.EndsAt >= DateTime.Now);
        return new DashboardDto(
            listings.Count,
            listings.Count(item => item.Status == ListingStatus.Published),
            listings.Sum(item => item.ViewCount),
            leads.Count,
            leads.Count(item => item.Status == LeadStatus.New),
            upcoming,
            days,
            listings.Select(ListingMapper.ToSummary).ToList(),
            leads.Select(ListingMapper.ToLead).ToList(),
            showings.Select(ListingMapper.ToShowing).ToList());
    }
}

[ApiController]
[Route("api/mortgage")]
public sealed class MortgageController : ControllerBase
{
    [HttpPost]
    public ActionResult<MortgageResult> Calculate(MortgageInput input)
    {
        try
        {
            return MortgageCalculator.Calculate(input);
        }
        catch (ArgumentOutOfRangeException ex)
        {
            return BadRequest(new ApiError("Could not calculate", 400, ex.Message));
        }
    }
}

[ApiController]
[Route("api/uploads")]
public sealed class UploadsController(IWebHostEnvironment env, IConfiguration config) : ControllerBase
{
    private static readonly HashSet<string> Extensions = [".jpg", ".jpeg", ".png", ".webp"];

    [HttpPost]
    [RequestSizeLimit(12 * 1024 * 1024)]
    public async Task<ActionResult<UploadResult>> Upload(IFormFile? file, CancellationToken ct)
    {
        if (file is null || file.Length == 0)
        {
            return BadRequest(new ApiError("Could not upload", 400, "Choose an image file."));
        }

        if (file.Length > 8 * 1024 * 1024)
        {
            return BadRequest(new ApiError("Could not upload", 400, "Images must be 8 MB or smaller."));
        }

        var extension = Path.GetExtension(file.FileName).ToLowerInvariant();
        if (!Extensions.Contains(extension))
        {
            return BadRequest(new ApiError("Could not upload", 400, "Use a JPEG, PNG, or WebP image."));
        }

        await using var buffer = new MemoryStream();
        await file.CopyToAsync(buffer, ct);
        var bytes = buffer.ToArray();
        if (!LooksLikeImage(bytes, extension))
        {
            return BadRequest(new ApiError("Could not upload", 400, "That file does not look like an image."));
        }

        var root = ResolveRoot(env, config);
        Directory.CreateDirectory(root);
        var name = $"{Guid.NewGuid():N}{extension}";
        await System.IO.File.WriteAllBytesAsync(Path.Combine(root, name), bytes, ct);
        return new UploadResult($"/uploads/{name}");
    }

    public static string ResolveRoot(IWebHostEnvironment env, IConfiguration config)
    {
        var configured = config["Storage:Root"] ?? "App_Data/uploads";
        return Path.IsPathRooted(configured) ? configured : Path.Combine(env.ContentRootPath, configured);
    }

    private static bool LooksLikeImage(byte[] bytes, string extension)
    {
        if (bytes.Length < 12)
        {
            return false;
        }

        var jpeg = bytes[0] == 0xFF && bytes[1] == 0xD8;
        var png = bytes[0] == 0x89 && bytes[1] == 0x50 && bytes[2] == 0x4E && bytes[3] == 0x47;
        var webp = bytes[0] == (byte)'R' && bytes[1] == (byte)'I' && bytes[2] == (byte)'F' && bytes[3] == (byte)'F'
            && bytes[8] == (byte)'W' && bytes[9] == (byte)'E' && bytes[10] == (byte)'B' && bytes[11] == (byte)'P';
        return extension switch
        {
            ".jpg" or ".jpeg" => jpeg,
            ".png" => png,
            ".webp" => webp,
            _ => false
        };
    }
}

[ApiController]
[Route("api/health")]
public sealed class HealthController : ControllerBase
{
    [HttpGet]
    public IActionResult Get() => Ok(new { status = "ok" });
}
