using Ulric.Api.Models;
using Ulric.Api.Services;

namespace Ulric.Api.Data;

public static class DbSeeder
{
    public const string DemoSlug = "2147-osoberry-lane-eugene";

    public static async Task SeedAsync(UlricDbContext db, CancellationToken ct = default)
    {
        if (db.Listings.Any())
        {
            return;
        }

        var now = DateTime.Now;
        var agent = new AgentCard(
            "Mara Ellison",
            "mara.ellison@example.com",
            "(541) 555-0148",
            "Ellison & Field",
            "Mara writes listing pages for bungalows, ranches, and newer infill houses in Eugene and Springfield. She meets buyers at the property.",
            "media/agent-mara.jpg",
            "Christina @ wocintechchat.com",
            "https://unsplash.com/photos/0Zx1bDv5BNY");

        var osoberry = House(
            Guid.Parse("7c1e0a10-0001-4000-8000-000000000001"),
            "2147 Osoberry Lane",
            "Eugene",
            "97405",
            689000,
            3,
            2,
            1840,
            0.16m,
            1926,
            "alder",
            "A 1926 bungalow with a deep front porch",
            "The porch faces the firs and stays dry in a long rain. Fir floors run through the front rooms, and a brick fireplace sits between built-in bookcases. The kitchen was opened in 2018, with a door to a side garden of ferns and a small vegetable bed. Three bedrooms share a renovated hall bath. A single garage is at the back of the lot.",
            "Osoberry Lane is a fictional street in south Eugene, close to the Amazon Creek path and the fir canopy. Amazon Park is a short walk, and Wayne Morse Family Farm is an easy weekend trip from this side of town. The map pin is a neighborhood stand-in, not a surveyed parcel.",
            "Families in this part of south Eugene often name Camas Ridge Community Elementary, Roosevelt Middle School, and South Eugene High School. Confirm the current boundary with Eugene School District 4J.",
            "Amazon Park, the Amazon Creek path, and Wayne Morse Family Farm.",
            ["Covered front porch", "Fir floors", "Brick fireplace and bookcases", "Kitchen opened in 2018", "Side garden", "Updated hall bath", "Single garage"],
            44.0305,
            -123.0855,
            142,
            now,
            agent);
        Photo(osoberry, 0, "osoberry-porch.jpg", "Front porch", "Karina G", "https://unsplash.com/photos/O4G2VR9Leb0");
        Photo(osoberry, 1, "osoberry-door.jpg", "Front door", "Amanda Smith", "https://unsplash.com/photos/_lfGDMDIJq0");
        Photo(osoberry, 2, "osoberry-kitchen.jpg", "Wood kitchen", "Ariana Prestes", "https://unsplash.com/photos/MpSnQAUTgcE");
        Photo(osoberry, 3, "osoberry-living.jpg", "Living room", "Sylwia Bartyzel", "https://unsplash.com/photos/7_cSSarxoAA");
        Photo(osoberry, 4, "osoberry-bath.jpg", "Bath", "Mika Ruusunen", "https://unsplash.com/photos/ypVM8PnygUo");
        Photo(osoberry, 5, "osoberry-garden.jpg", "Front garden", "Aleksandra Boguslawska", "https://unsplash.com/photos/c54ZhWDLEDo");

        var kiln = House(
            Guid.Parse("7c1e0a10-0001-4000-8000-000000000002"),
            "640 Kiln Court",
            "Springfield",
            "97477",
            525000,
            3,
            2,
            1610,
            0.21m,
            1962,
            "hearth",
            "A 1962 ranch on a deep lawn",
            "The ranch sits low on a wide lot, with the living room windows facing the lawn. The kitchen was replaced in 2016 and still has room for a table. Two bedrooms are on the quiet side of the hall, and the primary bedroom opens toward the back yard. A carport keeps the rain off the driveway.",
            "Kiln Court is a fictional street in Springfield, on the side of town that uses Island Park and the Willamette path. Dorris Ranch is a short drive when the filbert orchard is open to visitors. The map pin is a neighborhood stand-in, not a surveyed parcel.",
            "Central Springfield is served by Springfield Public Schools. Buyers usually ask about Hamlin Middle School and Springfield High School. Confirm the current boundary with the district.",
            "Island Park along the Willamette, and Dorris Ranch.",
            ["Single-level living", "Deep lawn", "Kitchen replaced in 2016", "Primary bedroom toward the yard", "Carport", "Attached storage"],
            44.0468,
            -123.0215,
            86,
            now,
            agent);
        Photo(kiln, 0, "kiln-front.jpg", "Front of the house", "Jacob Aguilar-Friend", "https://unsplash.com/photos/FRUNWjolvNA");
        Photo(kiln, 1, "kiln-street.jpg", "House and trees", "Rula Sibai", "https://unsplash.com/photos/-vq7mi4oF0s");
        Photo(kiln, 2, "kiln-kitchen.jpg", "Kitchen", "Jeff Sheldon", "https://unsplash.com/photos/4vr9a_sdJ78");
        Photo(kiln, 3, "kiln-living.jpg", "Living room", "Ales Krivec", "https://unsplash.com/photos/hLxqYJspAkE");
        Photo(kiln, 4, "kiln-bedroom.jpg", "Bedroom", "Dakota Roos", "https://unsplash.com/photos/Ok7BPF_XcN4");
        Photo(kiln, 5, "kiln-yard.jpg", "Back lawn", "Ben Moore", "https://unsplash.com/photos/qjs4WqT8Ib0");
        Photo(kiln, 6, "kiln-lawn.jpg", "Front lawn", "Gozha Net", "https://unsplash.com/photos/xDrxJCdedcI");

        var cottonwood = House(
            Guid.Parse("7c1e0a10-0001-4000-8000-000000000003"),
            "88 Cottonwood Court",
            "Eugene",
            "97401",
            799000,
            4,
            3,
            2280,
            0.12m,
            2016,
            "linen",
            "A 2016 house a short walk from the river",
            "Built in 2016 on a small lot, the house keeps the main rooms on one floor and tucks two bedrooms upstairs. The kitchen faces the living room, and a slider opens to a fenced patio. Three baths, including a primary bath, were finished with the house. A two-car garage takes the alley.",
            "Cottonwood Court is a fictional address near downtown Eugene, within a walk of Skinner Butte and the riverfront path. Alton Baker Park is across the river. The map pin is a neighborhood stand-in, not a surveyed parcel.",
            "Downtown Eugene families often look at Edison Elementary School, Roosevelt Middle School, and South Eugene High School. Confirm the current boundary with Eugene School District 4J.",
            "Skinner Butte Park, the riverfront path, and Alton Baker Park.",
            ["Built in 2016", "Main floor living", "Two upstairs bedrooms", "Primary bath", "Fenced patio", "Two-car garage"],
            44.0568,
            -123.0935,
            64,
            now,
            agent);
        Photo(cottonwood, 0, "cottonwood-front.jpg", "Street front", "Jassy Onyae", "https://unsplash.com/photos/1gBUXhf0PtA");
        Photo(cottonwood, 1, "cottonwood-kitchen.jpg", "Kitchen", "Anna Dziubinska", "https://unsplash.com/photos/mVhd5QVlDWw");
        Photo(cottonwood, 2, "cottonwood-living.jpg", "Living room", "Patrick Tomasso", "https://unsplash.com/photos/Oaqk7qqNh_c");
        Photo(cottonwood, 3, "cottonwood-bedroom.jpg", "Bedroom", "Bonnie Meisels", "https://unsplash.com/photos/Y5uyOoct2pg");
        Photo(cottonwood, 4, "cottonwood-bath.jpg", "Bath", "Paul Evans", "https://unsplash.com/photos/CtkDsu4w-Rs");

        var daysUntilSaturday = ((int)DayOfWeek.Saturday - (int)now.DayOfWeek + 7) % 7;
        if (daysUntilSaturday == 0)
        {
            daysUntilSaturday = 7;
        }

        var saturday = now.Date.AddDays(daysUntilSaturday);
        Open(osoberry, saturday.AddHours(11), saturday.AddHours(14), "Drop in. No appointment.");
        Open(kiln, saturday.AddHours(12), saturday.AddHours(14), "The side gate will be open.");
        Windows(osoberry, now, 6);
        Windows(kiln, now, 4);
        Windows(cottonwood, now, 5);

        var tomorrow = now.Date.AddDays(1);
        osoberry.Showings.Add(new Showing
        {
            Id = Guid.Parse("7c1e0a10-0001-4000-8000-000000000004"),
            ListingId = osoberry.Id,
            StartsAt = tomorrow.AddHours(10).AddMinutes(30),
            EndsAt = tomorrow.AddHours(11),
            VisitorName = "Priya Shah",
            VisitorEmail = "priya.shah@example.com",
            VisitorPhone = "(541) 555-0172",
            Status = ShowingStatus.Booked,
            CreatedAt = now.AddDays(-1)
        });

        Lead(osoberry, "Helen Cho", "helen.cho@example.com", "(541) 555-0104", "Could we see the porch in the late afternoon this week?", true, LeadStatus.New, now.AddDays(-1));
        Lead(osoberry, "Priya Shah", "priya.shah@example.com", "(541) 555-0172", "Tomorrow works. We will come from the school.", true, LeadStatus.Showing, now.AddDays(-2));
        Lead(kiln, "Andre Walsh", "andre.walsh@example.com", "(541) 555-0166", "We want a single-level house with a yard for the dog.", false, LeadStatus.Contacted, now.AddDays(-4));
        Lead(cottonwood, "Jonah Peck", "jonah.peck@example.com", "(541) 555-0190", "We would like to write.", true, LeadStatus.Offer, now.AddDays(-6));

        db.Listings.AddRange(osoberry, kiln, cottonwood);
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

    private static void Photo(Listing listing, int order, string file, string caption, string credit, string creditUrl)
    {
        listing.Photos.Add(new ListingPhoto
        {
            Id = Guid.NewGuid(),
            ListingId = listing.Id,
            Url = "media/" + file,
            Caption = caption,
            CreditName = credit,
            CreditUrl = creditUrl,
            SortOrder = order
        });
    }

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
}
