using System.Text.Json;
using Ulric.Api.Models;
using Ulric.Api.Services;

namespace Ulric.Api.Contracts;

public sealed class ListingWrite
{
    public string Status { get; set; } = "draft";
    public string Theme { get; set; } = "alder";
    public string Street { get; set; } = "";
    public string City { get; set; } = "";
    public string State { get; set; } = "";
    public string PostalCode { get; set; } = "";
    public string Country { get; set; } = "USA";
    public decimal Price { get; set; }
    public decimal Beds { get; set; }
    public decimal Baths { get; set; }
    public int SquareFeet { get; set; }
    public decimal LotAcres { get; set; }
    public int YearBuilt { get; set; }
    public string Headline { get; set; } = "";
    public string Description { get; set; } = "";
    public string Neighborhood { get; set; } = "";
    public string Schools { get; set; } = "";
    public string Parks { get; set; } = "";
    public List<string> Features { get; set; } = [];
    public string AgentName { get; set; } = "";
    public string AgentEmail { get; set; } = "";
    public string AgentPhone { get; set; } = "";
    public string AgentBrokerage { get; set; } = "";
    public string AgentBio { get; set; } = "";
    public string AgentHeadshotUrl { get; set; } = "";
    public string? AgentHeadshotCredit { get; set; }
    public string? AgentHeadshotCreditUrl { get; set; }
    public List<PhotoWrite> Photos { get; set; } = [];
    public List<VisitWrite> OpenHouses { get; set; } = [];
    public List<WindowWrite> ShowingWindows { get; set; } = [];
}

public sealed class PhotoWrite
{
    public string Url { get; set; } = "";
    public string Caption { get; set; } = "";
    public string CreditName { get; set; } = "";
    public string CreditUrl { get; set; } = "";
}

public sealed class VisitWrite
{
    public DateTime StartsAt { get; set; }
    public DateTime EndsAt { get; set; }
    public string Notes { get; set; } = "";
}

public sealed class WindowWrite
{
    public DateTime StartsAt { get; set; }
    public DateTime EndsAt { get; set; }
    public int SlotMinutes { get; set; } = 30;
}

public sealed class LeadWrite
{
    public string Name { get; set; } = "";
    public string Email { get; set; } = "";
    public string Phone { get; set; } = "";
    public string Message { get; set; } = "";
    public bool PreApproved { get; set; }
}

public sealed class ShowingWrite
{
    public string Name { get; set; } = "";
    public string Email { get; set; } = "";
    public string Phone { get; set; } = "";
    public DateTime StartsAt { get; set; }
    public DateTime EndsAt { get; set; }
}

public sealed class StatusWrite
{
    public string Status { get; set; } = "";
}

public sealed record ApiError(string Title, int Status, string Detail);

public sealed record ListingDetail(
    Guid Id,
    string Slug,
    string Status,
    string Theme,
    string Street,
    string City,
    string State,
    string PostalCode,
    string Country,
    decimal Price,
    decimal Beds,
    decimal Baths,
    int SquareFeet,
    decimal LotAcres,
    int YearBuilt,
    string Headline,
    string Description,
    string Neighborhood,
    string Schools,
    string Parks,
    IReadOnlyList<string> Features,
    string AgentName,
    string AgentEmail,
    string AgentPhone,
    string AgentBrokerage,
    string AgentBio,
    string AgentHeadshotUrl,
    string? AgentHeadshotCredit,
    string? AgentHeadshotCreditUrl,
    double? Latitude,
    double? Longitude,
    int ViewCount,
    IReadOnlyList<PhotoDto> Photos,
    IReadOnlyList<VisitDto> OpenHouses,
    IReadOnlyList<WindowDto> ShowingWindows,
    DateTime CreatedAt,
    DateTime UpdatedAt);

public sealed record PhotoDto(Guid Id, string Url, string Caption, string CreditName, string CreditUrl, int SortOrder);
public sealed record VisitDto(Guid Id, DateTime StartsAt, DateTime EndsAt, string Notes);
public sealed record WindowDto(Guid Id, DateTime StartsAt, DateTime EndsAt, int SlotMinutes);
public sealed record SlotDto(DateTime StartsAt, DateTime EndsAt, bool Available);

public sealed record ListingSummary(
    Guid Id,
    string Slug,
    string Status,
    string Theme,
    string Street,
    string City,
    string State,
    decimal Price,
    string Headline,
    string? PhotoUrl,
    int ViewCount,
    int LeadCount,
    decimal Beds,
    decimal Baths,
    int SquareFeet);

public sealed record LeadDto(
    Guid Id,
    Guid ListingId,
    string ListingStreet,
    string Name,
    string Email,
    string Phone,
    string Message,
    bool PreApproved,
    string Status,
    DateTime CreatedAt);

public sealed record ShowingDto(
    Guid Id,
    Guid ListingId,
    string ListingStreet,
    DateTime StartsAt,
    DateTime EndsAt,
    string VisitorName,
    string VisitorEmail,
    string VisitorPhone,
    string Status,
    string IcsUrl);

public sealed record DayCount(string Date, int Count);

public sealed record DashboardDto(
    int ListingCount,
    int PublishedCount,
    int ViewCount,
    int LeadCount,
    int NewLeadCount,
    int UpcomingShowings,
    IReadOnlyList<DayCount> LeadsByDay,
    IReadOnlyList<ListingSummary> Listings,
    IReadOnlyList<LeadDto> Leads,
    IReadOnlyList<ShowingDto> Showings);

public sealed record UploadResult(string Url);

public static class ListingMapper
{
    public static readonly string[] Themes = ["alder", "hearth", "linen"];

    public static ListingDetail ToDetail(Listing listing, string? publicBaseUrl = null) => new(
        listing.Id,
        listing.Slug,
        StatusName(listing.Status),
        listing.Theme,
        listing.Street,
        listing.City,
        listing.State,
        listing.PostalCode,
        listing.Country,
        listing.Price,
        listing.Beds,
        listing.Baths,
        listing.SquareFeet,
        listing.LotAcres,
        listing.YearBuilt,
        listing.Headline,
        listing.Description,
        listing.Neighborhood,
        listing.Schools,
        listing.Parks,
        Unpack(listing.FeaturesJson),
        listing.AgentName,
        listing.AgentEmail,
        listing.AgentPhone,
        listing.AgentBrokerage,
        listing.AgentBio,
        PublicUrls.Apply(listing.AgentHeadshotUrl, publicBaseUrl),
        listing.AgentHeadshotCredit,
        listing.AgentHeadshotCreditUrl,
        listing.Latitude,
        listing.Longitude,
        listing.ViewCount,
        listing.Photos.OrderBy(photo => photo.SortOrder).Select(photo => ToPhoto(photo, publicBaseUrl)).ToList(),
        listing.OpenHouses.OrderBy(item => item.StartsAt).Select(ToVisit).ToList(),
        listing.ShowingWindows.OrderBy(item => item.StartsAt).Select(ToWindow).ToList(),
        listing.CreatedAt,
        listing.UpdatedAt);

    public static ListingSummary ToSummary(Listing listing, string? publicBaseUrl = null) => new(
        listing.Id,
        listing.Slug,
        StatusName(listing.Status),
        listing.Theme,
        listing.Street,
        listing.City,
        listing.State,
        listing.Price,
        listing.Headline,
        PhotoUrl(listing, publicBaseUrl),
        listing.ViewCount,
        listing.Leads.Count,
        listing.Beds,
        listing.Baths,
        listing.SquareFeet);

    public static LeadDto ToLead(Lead lead) => new(
        lead.Id,
        lead.ListingId,
        lead.Listing?.Street ?? "",
        lead.Name,
        lead.Email,
        lead.Phone,
        lead.Message,
        lead.PreApproved,
        LeadName(lead.Status),
        lead.CreatedAt);

    public static ShowingDto ToShowing(Showing showing, string? publicBaseUrl = null) => new(
        showing.Id,
        showing.ListingId,
        showing.Listing?.Street ?? "",
        showing.StartsAt,
        showing.EndsAt,
        showing.VisitorName,
        showing.VisitorEmail,
        showing.VisitorPhone,
        showing.Status == ShowingStatus.Cancelled ? "cancelled" : "booked",
        PublicUrls.Apply($"api/showings/{showing.Id}/calendar.ics", publicBaseUrl));

    public static PhotoDto ToPhoto(ListingPhoto photo, string? publicBaseUrl = null) =>
        new(photo.Id, PublicUrls.Apply(photo.Url, publicBaseUrl), photo.Caption, photo.CreditName, photo.CreditUrl, photo.SortOrder);

    private static string? PhotoUrl(Listing listing, string? publicBaseUrl)
    {
        var url = listing.Photos.OrderBy(photo => photo.SortOrder).Select(photo => photo.Url).FirstOrDefault();
        return url is null ? null : PublicUrls.Apply(url, publicBaseUrl);
    }

    public static VisitDto ToVisit(OpenHouse visit) =>
        new(visit.Id, visit.StartsAt, visit.EndsAt, visit.Notes);

    public static WindowDto ToWindow(ShowingWindow window) =>
        new(window.Id, window.StartsAt, window.EndsAt, window.SlotMinutes);

    public static string StatusName(ListingStatus status) =>
        status == ListingStatus.Published ? "published" : "draft";

    public static string LeadName(LeadStatus status) => status switch
    {
        LeadStatus.Contacted => "contacted",
        LeadStatus.Showing => "showing",
        LeadStatus.Offer => "offer",
        _ => "new"
    };

    public static bool TryLeadStatus(string? value, out LeadStatus status)
    {
        switch (value?.Trim().ToLowerInvariant())
        {
            case "new":
                status = LeadStatus.New;
                return true;
            case "contacted":
                status = LeadStatus.Contacted;
                return true;
            case "showing":
                status = LeadStatus.Showing;
                return true;
            case "offer":
                status = LeadStatus.Offer;
                return true;
            default:
                status = LeadStatus.New;
                return false;
        }
    }

    public static string Pack(IEnumerable<string>? items) =>
        JsonSerializer.Serialize((items ?? [])
            .Select(item => item.Trim())
            .Where(item => item.Length > 0)
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .Take(40)
            .ToList());

    public static List<string> Unpack(string? json)
    {
        if (string.IsNullOrWhiteSpace(json))
        {
            return [];
        }

        try
        {
            return JsonSerializer.Deserialize<List<string>>(json) ?? [];
        }
        catch (JsonException)
        {
            return [];
        }
    }

    public static string FormatAddress(string street, string city, string state, string postalCode, string country) =>
        string.Join(", ", new[] { street, city, state, postalCode, country }.Where(part => !string.IsNullOrWhiteSpace(part)));
}
