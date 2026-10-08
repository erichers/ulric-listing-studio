using Microsoft.EntityFrameworkCore;
using Ulric.Api.Contracts;
using Ulric.Api.Data;
using Ulric.Api.Models;

namespace Ulric.Api.Services;

public sealed class ListingService(UlricDbContext db, NominatimGeocoder geocoder)
{
    public async Task<(Listing? Listing, string? Error)> SaveAsync(Listing? existing, ListingWrite input, CancellationToken ct)
    {
        var error = Validate(input);
        if (error is not null)
        {
            return (null, error);
        }

        var listing = existing ?? new Listing
        {
            Id = Guid.NewGuid(),
            CreatedAt = DateTime.UtcNow
        };

        var nextAddress = ListingMapper.FormatAddress(input.Street, input.City, input.State, input.PostalCode, input.Country);
        var previousAddress = existing is null
            ? ""
            : ListingMapper.FormatAddress(existing.Street, existing.City, existing.State, existing.PostalCode, existing.Country);

        if (!string.Equals(nextAddress, previousAddress, StringComparison.OrdinalIgnoreCase))
        {
            var geo = await geocoder.LookupAsync(nextAddress, ct);
            listing.Latitude = geo?.Latitude;
            listing.Longitude = geo?.Longitude;
        }

        if (existing is null)
        {
            var slugs = await db.Listings.Select(item => item.Slug).ToListAsync(ct);
            listing.Slug = SlugGenerator.EnsureUnique(SlugGenerator.FromAddress(input.Street, input.City), slugs);
            db.Listings.Add(listing);
        }

        var publishing = input.Status.Equals("published", StringComparison.OrdinalIgnoreCase);
        listing.Status = publishing ? ListingStatus.Published : ListingStatus.Draft;
        listing.Theme = ListingMapper.Themes.Contains(input.Theme, StringComparer.OrdinalIgnoreCase)
            ? input.Theme.Trim().ToLowerInvariant()
            : "alder";
        listing.Street = input.Street.Trim();
        listing.City = input.City.Trim();
        listing.State = input.State.Trim();
        listing.PostalCode = input.PostalCode.Trim();
        listing.Country = string.IsNullOrWhiteSpace(input.Country) ? "USA" : input.Country.Trim();
        listing.Price = input.Price;
        listing.Beds = input.Beds;
        listing.Baths = input.Baths;
        listing.SquareFeet = input.SquareFeet;
        listing.LotAcres = input.LotAcres;
        listing.YearBuilt = input.YearBuilt;
        listing.Headline = input.Headline.Trim();
        listing.Description = input.Description.Trim();
        listing.Neighborhood = input.Neighborhood.Trim();
        listing.FeaturesJson = ListingMapper.Pack(input.Features);
        listing.AgentName = input.AgentName.Trim();
        listing.AgentEmail = input.AgentEmail.Trim();
        listing.AgentPhone = input.AgentPhone.Trim();
        listing.AgentBrokerage = input.AgentBrokerage.Trim();
        listing.AgentBio = input.AgentBio.Trim();
        listing.AgentHeadshotUrl = input.AgentHeadshotUrl.Trim();
        listing.AgentHeadshotCredit = input.AgentHeadshotCredit?.Trim();
        listing.AgentHeadshotCreditUrl = input.AgentHeadshotCreditUrl?.Trim();
        listing.UpdatedAt = DateTime.UtcNow;

        if (existing is not null)
        {
            db.Photos.RemoveRange(listing.Photos);
            db.OpenHouses.RemoveRange(listing.OpenHouses);
            db.ShowingWindows.RemoveRange(listing.ShowingWindows);
            listing.Photos.Clear();
            listing.OpenHouses.Clear();
            listing.ShowingWindows.Clear();
        }

        var order = 0;
        foreach (var photo in input.Photos.Where(item => !string.IsNullOrWhiteSpace(item.Url)))
        {
            listing.Photos.Add(new ListingPhoto
            {
                Id = Guid.NewGuid(),
                Url = photo.Url.Trim(),
                Caption = photo.Caption.Trim(),
                CreditName = photo.CreditName.Trim(),
                CreditUrl = photo.CreditUrl.Trim(),
                SortOrder = order++
            });
        }

        foreach (var visit in input.OpenHouses.Where(item => item.EndsAt > item.StartsAt))
        {
            listing.OpenHouses.Add(new OpenHouse
            {
                Id = Guid.NewGuid(),
                StartsAt = visit.StartsAt,
                EndsAt = visit.EndsAt,
                Notes = visit.Notes.Trim()
            });
        }

        foreach (var window in input.ShowingWindows.Where(item => item.EndsAt > item.StartsAt))
        {
            listing.ShowingWindows.Add(new ShowingWindow
            {
                Id = Guid.NewGuid(),
                StartsAt = window.StartsAt,
                EndsAt = window.EndsAt,
                SlotMinutes = window.SlotMinutes is < 15 or > 240 ? 30 : window.SlotMinutes
            });
        }

        await db.SaveChangesAsync(ct);
        return (listing, null);
    }

    public static string? Validate(ListingWrite input)
    {
        var publishing = input.Status.Equals("published", StringComparison.OrdinalIgnoreCase);
        var problems = new List<string>();

        if (input.Street.Trim().Length > 200) problems.Add("Street is too long.");
        if (input.Headline.Trim().Length > 180) problems.Add("Headline is too long.");
        if (input.Description.Length > 8000) problems.Add("Description is too long.");
        if (input.Neighborhood.Length > 4000) problems.Add("Neighborhood text is too long.");
        if (input.Price < 0) problems.Add("Price cannot be negative.");
        if (input.Beds < 0 || input.Baths < 0 || input.SquareFeet < 0 || input.LotAcres < 0)
        {
            problems.Add("Facts cannot be negative.");
        }

        if (input.YearBuilt != 0 && input.YearBuilt is < 1700 or > 2100)
        {
            problems.Add("Year built looks wrong.");
        }

        if (!string.IsNullOrWhiteSpace(input.AgentEmail) && !EmailAddress.IsValid(input.AgentEmail))
        {
            problems.Add("Agent email is not valid.");
        }

        if (!IsSafeUrl(input.AgentHeadshotUrl))
        {
            problems.Add("Headshot URL must start with http, https, or a site path.");
        }

        foreach (var photo in input.Photos)
        {
            if (!string.IsNullOrWhiteSpace(photo.Url) && !IsSafeUrl(photo.Url))
            {
                problems.Add("Photo URLs must start with http, https, or a site path.");
                break;
            }
        }

        if (!publishing && !input.Status.Equals("draft", StringComparison.OrdinalIgnoreCase))
        {
            problems.Add("Status must be draft or published.");
        }

        if (publishing)
        {
            if (string.IsNullOrWhiteSpace(input.Street)) problems.Add("Add a street address before publishing.");
            if (string.IsNullOrWhiteSpace(input.City)) problems.Add("Add a city before publishing.");
            if (input.Price <= 0) problems.Add("Add a price before publishing.");
            if (input.Photos.All(photo => string.IsNullOrWhiteSpace(photo.Url))) problems.Add("Add at least one photo before publishing.");
            if (string.IsNullOrWhiteSpace(input.AgentName)) problems.Add("Add the agent name before publishing.");
        }

        return problems.Count == 0 ? null : string.Join(" ", problems);
    }

    public static bool IsSafeUrl(string? url)
    {
        if (string.IsNullOrWhiteSpace(url))
        {
            return true;
        }

        var value = url.Trim();
        if (value.StartsWith('/') && !value.StartsWith("//") && !value.Contains('\\'))
        {
            return true;
        }

        return Uri.TryCreate(value, UriKind.Absolute, out var parsed)
            && (parsed.Scheme == Uri.UriSchemeHttp || parsed.Scheme == Uri.UriSchemeHttps);
    }
}
