namespace Ulric.Api.Models;

public sealed class Listing
{
    public Guid Id { get; set; }
    public string Slug { get; set; } = "";
    public ListingStatus Status { get; set; } = ListingStatus.Draft;
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
    public string FeaturesJson { get; set; } = "[]";
    public string AgentName { get; set; } = "";
    public string AgentEmail { get; set; } = "";
    public string AgentPhone { get; set; } = "";
    public string AgentBrokerage { get; set; } = "";
    public string AgentBio { get; set; } = "";
    public string AgentHeadshotUrl { get; set; } = "";
    public string? AgentHeadshotCredit { get; set; }
    public string? AgentHeadshotCreditUrl { get; set; }
    public double? Latitude { get; set; }
    public double? Longitude { get; set; }
    public int ViewCount { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }

    public List<ListingPhoto> Photos { get; set; } = [];
    public List<OpenHouse> OpenHouses { get; set; } = [];
    public List<ShowingWindow> ShowingWindows { get; set; } = [];
    public List<Lead> Leads { get; set; } = [];
    public List<Showing> Showings { get; set; } = [];
}

public sealed class ListingPhoto
{
    public Guid Id { get; set; }
    public Guid ListingId { get; set; }
    public Listing? Listing { get; set; }
    public string Url { get; set; } = "";
    public string Caption { get; set; } = "";
    public string CreditName { get; set; } = "";
    public string CreditUrl { get; set; } = "";
    public int SortOrder { get; set; }
}

public sealed class OpenHouse
{
    public Guid Id { get; set; }
    public Guid ListingId { get; set; }
    public Listing? Listing { get; set; }
    public DateTime StartsAt { get; set; }
    public DateTime EndsAt { get; set; }
    public string Notes { get; set; } = "";
}

public sealed class ShowingWindow
{
    public Guid Id { get; set; }
    public Guid ListingId { get; set; }
    public Listing? Listing { get; set; }
    public DateTime StartsAt { get; set; }
    public DateTime EndsAt { get; set; }
    public int SlotMinutes { get; set; } = 30;
}

public sealed class Showing
{
    public Guid Id { get; set; }
    public Guid ListingId { get; set; }
    public Listing? Listing { get; set; }
    public DateTime StartsAt { get; set; }
    public DateTime EndsAt { get; set; }
    public string VisitorName { get; set; } = "";
    public string VisitorEmail { get; set; } = "";
    public string VisitorPhone { get; set; } = "";
    public ShowingStatus Status { get; set; } = ShowingStatus.Booked;
    public DateTime CreatedAt { get; set; }
}

public sealed class Lead
{
    public Guid Id { get; set; }
    public Guid ListingId { get; set; }
    public Listing? Listing { get; set; }
    public string Name { get; set; } = "";
    public string Email { get; set; } = "";
    public string Phone { get; set; } = "";
    public string Message { get; set; } = "";
    public bool PreApproved { get; set; }
    public LeadStatus Status { get; set; } = LeadStatus.New;
    public DateTime CreatedAt { get; set; }
}

public sealed class GeocodeCacheEntry
{
    public string Query { get; set; } = "";
    public bool Found { get; set; }
    public double? Latitude { get; set; }
    public double? Longitude { get; set; }
    public string? DisplayName { get; set; }
    public DateTime FetchedAt { get; set; }
}

public enum ListingStatus
{
    Draft,
    Published
}

public enum LeadStatus
{
    New,
    Contacted,
    Showing,
    Offer
}

public enum ShowingStatus
{
    Booked,
    Cancelled
}
