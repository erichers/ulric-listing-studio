using Microsoft.EntityFrameworkCore;
using Ulric.Api.Models;
using Ulric.Api.Services;

namespace Ulric.Api.Data;

public static class DbSeeder
{
    public const string DemoSlug = "418-larkspur-way-fernhollow";

    public static readonly Guid DemoId = Guid.Parse("7c1e0a10-0001-4000-8000-000000000001");

    // Earlier sample listings. They are no longer part of the demo and are removed from existing databases at startup.
    private static readonly Guid[] RetiredIds =
    [
        Guid.Parse("7c1e0a10-0001-4000-8000-000000000002"),
        Guid.Parse("7c1e0a10-0001-4000-8000-000000000003"),
    ];

    // "Group: item" puts a feature under a heading on the listing page. A feature without a colon is listed under Highlights.
    private static readonly string[] DemoFeatures =
    [
        "Interior: Wood floors in the main rooms",
        "Interior: Reading corner off the living room",
        "Interior: Kitchen with an island and a breakfast nook",
        "Interior: Separate dining room",
        "Interior: Three bedrooms on the main floor",
        "Interior: Full bath with a tiled shower",
        "Interior: Half bath",
        "Basement: Finished, with a fourth bedroom",
        "Basement: Storage",
        "Exterior: Painted lap siding",
        "Exterior: Low hip roof",
        "Exterior: Covered entry with a wood door",
        "Outdoor: Back deck",
        "Outdoor: Mature trees and garden beds",
        "Parking: Driveway",
    ];

    private const decimal DemoBeds = 4;
    private const decimal DemoBaths = 1.5m;
    private const int DemoYear = 1947;
    private const string DemoHeadline = "A 1940s bungalow with a back deck and a finished basement";
    private const string DemoDescription =
        "A one-storey 1940s bungalow on a finished basement in the fictional town of Fernhollow. " +
        "Wood floors run through the living room and a reading corner. " +
        "The kitchen opens to a breakfast nook and a separate dining room. " +
        "Three bedrooms are on the main floor and a fourth bedroom is downstairs. " +
        "There is a full bath with a tiled shower and a half bath. " +
        "Out back, a wood deck steps down to the garden.";
    private const string OldHeadline = "A 1926 bungalow with a deep front porch";

    private static readonly string OldFeaturesJson = System.Text.Json.JsonSerializer.Serialize(new[]
    {
        "Covered front porch", "Fir floors", "Brick fireplace and bookcases", "Kitchen opened in 2018", "Side garden", "Updated hall bath", "Single garage",
    });

    private const string OldPorchMessage = "Could we see the porch in the late afternoon this week?";
    private const string PorchMessage = "Could we see the back deck in the late afternoon this week?";
    private const string OldMapSentence = "The map pin is a neighborhood stand-in, not a surveyed parcel.";
    private const string MapSentence = "The map shows a general neighborhood area, not a surveyed parcel.";

    // Free stock interiors (CC0 / public domain, Wikimedia Commons). They do not show any real listing. See CREDITS.md.
    private static readonly DemoPhoto[] DemoPhotos =
    [
        new(0, "home-01.webp", "Front of the house", "Bobbyvaughnevergreen (Wikimedia Commons, CC0)", "https://commons.wikimedia.org/wiki/File:Evergreen_Dorrington_Pinecone_Cottage_exterior.jpg"),
        new(1, "home-02.webp", "Plants by the entry", "Daria Nepriakhina epicantus (Wikimedia Commons, CC0)", "https://commons.wikimedia.org/wiki/File:Plants_On_The_Front_Porch_(Unsplash).jpg"),
        new(2, "home-03.webp", "Living room", "Jarosław Ceborski jarson (Wikimedia Commons, CC0)", "https://commons.wikimedia.org/wiki/File:Living_room_(Unsplash).jpg"),
        new(3, "home-04.webp", "Living room toward the hall", "Kari Shea karishea (Wikimedia Commons, CC0)", "https://commons.wikimedia.org/wiki/File:Home_Sweet_Home_Pt._4_(Unsplash).jpg"),
        new(4, "home-05.webp", "Reading corner", "Sabri Tuzcu sabrituzcu (Wikimedia Commons, CC0)", "https://commons.wikimedia.org/wiki/File:Take_a_seat_(Unsplash).jpg"),
        new(5, "home-06.webp", "Kitchen", "Naomi Hébert naomish (Wikimedia Commons, CC0)", "https://commons.wikimedia.org/wiki/File:Kitchen_(Unsplash).jpg"),
        new(6, "home-07.webp", "Kitchen island", "NeONBRAND neonbrand (Wikimedia Commons, CC0)", "https://commons.wikimedia.org/wiki/File:Blue_white_kitchen_interior_(Unsplash).jpg"),
        new(7, "home-08.webp", "Breakfast nook", "Nirzar Pangarkar nirzar (Wikimedia Commons, CC0)", "https://commons.wikimedia.org/wiki/File:Round_table_in_a_bright_room_(Unsplash).jpg"),
        new(8, "home-09.webp", "Dining room", "Erick Lee Hodge holasirhodge (Wikimedia Commons, CC0)", "https://commons.wikimedia.org/wiki/File:New_Home_(Unsplash).jpg"),
        new(9, "home-10.webp", "Bedroom with a bank of windows", "Markus Spiske markusspiske (Wikimedia Commons, CC0)", "https://commons.wikimedia.org/wiki/File:Hotel_bedroom_windows_(Unsplash).jpg"),
        new(10, "home-11.webp", "Bedroom", "Ali Inay inayali (Wikimedia Commons, CC0)", "https://commons.wikimedia.org/wiki/File:Ali_Inay_2015-02-25_(Unsplash).jpg"),
        new(11, "home-12.webp", "Bedroom", "Bekah Russom bekahrussom (Wikimedia Commons, CC0)", "https://commons.wikimedia.org/wiki/File:Bekah_Russom_2017-04-02_(Unsplash).jpg"),
        new(12, "home-13.webp", "Basement bedroom", "Gabriel Beaudry gbeaudry (Wikimedia Commons, CC0)", "https://commons.wikimedia.org/wiki/File:NY_loft_bedroom_(Unsplash).jpg"),
        new(13, "home-14.webp", "Bathroom", "Yellowstone National Park (Wikimedia Commons, public domain)", "https://commons.wikimedia.org/wiki/File:Bathroom_with_Shower_(48877908032).jpg"),
        new(14, "home-15.webp", "Tiled shower", "Yellowstone National Park (Wikimedia Commons, public domain)", "https://commons.wikimedia.org/wiki/File:Bathroom_Shower_(48877712171).jpg"),
        new(15, "home-16.webp", "Half bath", "Chris McKenna (Thryduulf) (Wikimedia Commons, public domain)", "https://commons.wikimedia.org/wiki/File:Bathroom_sink.jpg"),
        new(16, "home-17.webp", "Work corner", "Oliur Rahman ultralinx (Wikimedia Commons, CC0)", "https://commons.wikimedia.org/wiki/File:Laptop_in_the_living_room_(Unsplash).jpg"),
        new(17, "home-18.webp", "Back deck", "Chris Barbalis cbarbalis (Wikimedia Commons, CC0)", "https://commons.wikimedia.org/wiki/File:Partially_green_wooden_deck_(Unsplash).jpg")
    ];

    /// <summary>Brings an existing demo database in line with the current sample without touching anything a user added.</summary>
    public static async Task ReconcileAsync(UlricDbContext db, CancellationToken ct = default)
    {
        var retired = await db.Listings.Where(listing => RetiredIds.Contains(listing.Id)).ToListAsync(ct);
        db.Listings.RemoveRange(retired);

        var demo = await db.Listings.Include(listing => listing.Photos).FirstOrDefaultAsync(listing => listing.Id == DemoId, ct);
        if (demo is not null)
        {
            var current = demo.Photos.OrderBy(photo => photo.SortOrder).Select(photo => photo.Url).ToList();
            var wanted = DemoPhotos.Select(photo => "media/" + photo.File).ToList();
            var onlySeedPhotos = demo.Photos.All(photo => photo.Url.StartsWith("media/", StringComparison.Ordinal));
            if (onlySeedPhotos && !current.SequenceEqual(wanted))
            {
                db.Photos.RemoveRange(demo.Photos);
                foreach (var photo in DemoPhotos)
                {
                    db.Photos.Add(NewPhoto(demo.Id, photo.Order, photo.File, photo.Caption, photo.Credit, photo.CreditUrl));
                }
            }

            if (demo.FeaturesJson == OldFeaturesJson || demo.Headline == OldHeadline)
            {
                demo.FeaturesJson = ListingMapperFeatures(DemoFeatures);
                demo.Headline = DemoHeadline;
                demo.Description = DemoDescription;
                demo.Beds = DemoBeds;
                demo.Baths = DemoBaths;
                demo.YearBuilt = DemoYear;
            }

            demo.Neighborhood = demo.Neighborhood.Replace(OldMapSentence, MapSentence, StringComparison.Ordinal);
            if (demo.Latitude is { } lat) demo.Latitude = Math.Round(lat, 2);
            if (demo.Longitude is { } lng) demo.Longitude = Math.Round(lng, 2);

            // the sample lead that asked about the old porch now asks about the deck
            var porchLeads = await db.Leads.Where(lead => lead.ListingId == demo.Id && lead.Message == OldPorchMessage).ToListAsync(ct);
            foreach (var lead in porchLeads) lead.Message = PorchMessage;
        }

        await db.SaveChangesAsync(ct);
    }

    public static async Task SeedAsync(UlricDbContext db, CancellationToken ct = default)
    {
        if (db.Listings.Any())
        {
            await ReconcileAsync(db, ct);
            return;
        }

        var now = DateTime.Now;
        var agent = new AgentCard(
            "Mara Ellison",
            "mara.ellison@example.com",
            "(555) 555-0148",
            "Ellison & Field",
            "Mara writes listing pages for bungalows, ranches, and newer infill houses around Fernhollow. She meets buyers at the property.",
            "media/agent-mara.jpg",
            "Christina @ wocintechchat.com",
            "https://unsplash.com/photos/0Zx1bDv5BNY");

        var demoHouse = House(
            DemoId,
            "418 Larkspur Way",
            "Fernhollow",
            "00000",
            689000,
            DemoBeds,
            DemoBaths,
            1840,
            0.16m,
            DemoYear,
            "alder",
            DemoHeadline,
            DemoDescription,
            "Larkspur Way is a fictional street in Fernhollow, a fictional town made up for this demo. A creek path and a small park are a short walk away. The map shows a general, fictional area, not a surveyed parcel.",
            "Fernhollow is fictional, so there are no real school boundaries to report. A real listing would name the local schools and say to confirm boundaries with the district.",
            "A creek path, a neighborhood park, and a weekend farm stand (all fictional).",
            DemoFeatures,
            46.2,
            -98.5,
            142,
            now,
            agent);
        foreach (var photo in DemoPhotos)
        {
            Photo(demoHouse, photo.Order, photo.File, photo.Caption, photo.Credit, photo.CreditUrl);
        }

        var daysUntilSaturday = ((int)DayOfWeek.Saturday - (int)now.DayOfWeek + 7) % 7;
        if (daysUntilSaturday == 0)
        {
            daysUntilSaturday = 7;
        }

        var saturday = now.Date.AddDays(daysUntilSaturday);
        Open(demoHouse, saturday.AddHours(11), saturday.AddHours(14), "Drop in. No appointment.");
        Windows(demoHouse, now, 6);

        var tomorrow = now.Date.AddDays(1);
        demoHouse.Showings.Add(new Showing
        {
            Id = Guid.Parse("7c1e0a10-0001-4000-8000-000000000004"),
            ListingId = demoHouse.Id,
            StartsAt = tomorrow.AddHours(10).AddMinutes(30),
            EndsAt = tomorrow.AddHours(11),
            VisitorName = "Priya Shah",
            VisitorEmail = "priya.shah@example.com",
            VisitorPhone = "(555) 555-0172",
            Status = ShowingStatus.Booked,
            CreatedAt = now.AddDays(-1)
        });

        Lead(demoHouse, "Helen Cho", "helen.cho@example.com", "(555) 555-0104", PorchMessage, true, LeadStatus.New, now.AddDays(-1));
        Lead(demoHouse, "Priya Shah", "priya.shah@example.com", "(555) 555-0172", "Tomorrow works. We will come from the school.", true, LeadStatus.Showing, now.AddDays(-2));
        Lead(demoHouse, "Andre Walsh", "andre.walsh@example.com", "(555) 555-0166", "Is the back yard fenced? We have a dog.", false, LeadStatus.Contacted, now.AddDays(-4));
        Lead(demoHouse, "Jonah Peck", "jonah.peck@example.com", "(555) 555-0190", "We would like to write an offer after the open house.", true, LeadStatus.Offer, now.AddDays(-6));

        db.Listings.Add(demoHouse);
        await db.SaveChangesAsync(ct);
    }

    private static Listing House(
        Guid id,
        string street,
        string city,
        string postal,
        decimal price,
        decimal beds,
        decimal baths,
        int sqft,
        decimal lot,
        int year,
        string theme,
        string headline,
        string description,
        string neighborhood,
        string schools,
        string parks,
        string[] features,
        double latitude,
        double longitude,
        int views,
        DateTime now,
        AgentCard agent) => new()
    {
        Id = id,
        Slug = SlugGenerator.FromAddress(street, city),
        Status = ListingStatus.Published,
        Theme = theme,
        Street = street,
        City = city,
        State = "OR",
        PostalCode = postal,
        Country = "USA",
        Price = price,
        Beds = beds,
        Baths = baths,
        SquareFeet = sqft,
        LotAcres = lot,
        YearBuilt = year,
        Headline = headline,
        Description = description,
        Neighborhood = neighborhood,
        Schools = schools,
        Parks = parks,
        FeaturesJson = ListingMapperFeatures(features),
        AgentName = agent.Name,
        AgentEmail = agent.Email,
        AgentPhone = agent.Phone,
        AgentBrokerage = agent.Brokerage,
        AgentBio = agent.Bio,
        AgentHeadshotUrl = agent.Headshot,
        AgentHeadshotCredit = agent.Credit,
        AgentHeadshotCreditUrl = agent.CreditUrl,
        Latitude = latitude,
        Longitude = longitude,
        ViewCount = views,
        CreatedAt = now.AddDays(-18),
        UpdatedAt = now.AddDays(-1)
    };

    private static string ListingMapperFeatures(IEnumerable<string> features) =>
        System.Text.Json.JsonSerializer.Serialize(features);

    private static void Photo(Listing listing, int order, string file, string caption, string credit, string creditUrl) =>
        listing.Photos.Add(NewPhoto(listing.Id, order, file, caption, credit, creditUrl));

    private static ListingPhoto NewPhoto(Guid listingId, int order, string file, string caption, string credit, string creditUrl) => new()
    {
        Id = Guid.NewGuid(),
        ListingId = listingId,
        Url = "media/" + file,
        Caption = caption,
        CreditName = credit,
        CreditUrl = creditUrl,
        SortOrder = order
    };

    private static void Open(Listing listing, DateTime start, DateTime end, string notes)
    {
        listing.OpenHouses.Add(new OpenHouse
        {
            Id = Guid.NewGuid(),
            ListingId = listing.Id,
            StartsAt = start,
            EndsAt = end,
            Notes = notes
        });
    }

    private static void Windows(Listing listing, DateTime now, int days)
    {
        for (var day = 1; day <= days; day++)
        {
            var date = now.Date.AddDays(day);
            listing.ShowingWindows.Add(new ShowingWindow
            {
                Id = Guid.NewGuid(),
                ListingId = listing.Id,
                StartsAt = date.AddHours(10),
                EndsAt = date.AddHours(12),
                SlotMinutes = 30
            });
        }
    }

    private static void Lead(Listing listing, string name, string email, string phone, string message, bool preApproved, LeadStatus status, DateTime created)
    {
        listing.Leads.Add(new Lead
        {
            Id = Guid.NewGuid(),
            ListingId = listing.Id,
            Name = name,
            Email = email,
            Phone = phone,
            Message = message,
            PreApproved = preApproved,
            Status = status,
            CreatedAt = created
        });
    }

    private sealed record AgentCard(
        string Name,
        string Email,
        string Phone,
        string Brokerage,
        string Bio,
        string Headshot,
        string Credit,
        string CreditUrl);

    private sealed record DemoPhoto(int Order, string File, string Caption, string Credit, string CreditUrl);
}
