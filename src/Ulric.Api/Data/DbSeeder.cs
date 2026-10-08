using Ulric.Api.Models;
using Ulric.Api.Services;

namespace Ulric.Api.Data;

public static class DbSeeder
{
    public const string DemoSlug = "1847-alder-lane-cedarwick";

    public static async Task SeedAsync(UlricDbContext db, CancellationToken ct = default)
    {
        if (db.Listings.Any())
        {
            return;
        }

        var now = DateTime.Now;
        var listing = new Listing
        {
            Id = Guid.Parse("1847a1de-1a0e-4c0e-9a1e-1847a1d00001"),
            Slug = SlugGenerator.FromAddress("1847 Alder Lane", "Cedarwick"),
            Status = ListingStatus.Published,
            Theme = "alder",
            Street = "1847 Alder Lane",
            City = "Cedarwick",
            State = "OR",
            PostalCode = "97400",
            Country = "USA",
            Price = 875000,
            Beds = 4,
            Baths = 2.5m,
            SquareFeet = 2480,
            LotAcres = 0.18m,
            YearBuilt = 1924,
            Headline = "A 1924 craftsman with a deep front porch",
            Description = "The house sits back from Alder Lane behind a low boxwood hedge. Fir floors run through the front rooms, and the original built-in bookcases still flank the brick fireplace. The kitchen was rebuilt in 2019 with a soapstone counter and a door to the side garden. Upstairs, four bedrooms share a renovated hall bath and a quiet primary suite at the back. A single-car garage opens onto the alley.",
            Neighborhood = "Cedarwick is a made-up town for this demo, set among second-growth firs and a short main street. The pin on the map is a stand-in coordinate so the page can show a neighborhood without inventing a real address. The walk to the corner bakery is two blocks, and the school is one street south.",
            FeaturesJson = """["Original fir floors","Brick fireplace with built-in bookcases","Covered front porch","Kitchen rebuilt in 2019","Primary suite","Detached single-car garage","Side garden","Updated hall bath"]""",
            AgentName = "Mara Ellison",
            AgentEmail = "mara.ellison@example.com",
            AgentPhone = "(541) 555-0148",
            AgentBrokerage = "Ellison & Field",
            AgentBio = "Mara grew up in the valley and has sold older houses here for fourteen years. She writes each listing page herself.",
            AgentHeadshotUrl = Photo("photo-1573496359142-b8d87734a5a2", 800),
            AgentHeadshotCredit = "Christina @ wocintechchat.com",
            AgentHeadshotCreditUrl = "https://unsplash.com/photos/0Zx1bDv5BNY",
            Latitude = 45.5162,
            Longitude = -122.6784,
            ViewCount = 186,
            CreatedAt = now.AddDays(-18),
            UpdatedAt = now.AddDays(-1)
        };

        listing.Photos.Add(MakePhoto(listing.Id, 0, "photo-1761061079517-2ff8192b2f02", "The front porch", "Karina G", "https://unsplash.com/photos/O4G2VR9Leb0"));
        listing.Photos.Add(MakePhoto(listing.Id, 1, "photo-1625602812206-5ec545ca1231", "Street view", "Ian MacDonald", "https://unsplash.com/photos/-dcznEJPmsk"));
        listing.Photos.Add(MakePhoto(listing.Id, 2, "photo-1631458325834-8f678e48912c", "Front door", "Amanda Smith", "https://unsplash.com/photos/_lfGDMDIJq0"));
        listing.Photos.Add(MakePhoto(listing.Id, 3, "photo-1714606956017-8ee1d4015fd1", "Side windows", "Amadeus Moga", "https://unsplash.com/photos/UquwsJuETQk"));
        listing.Photos.Add(MakePhoto(listing.Id, 4, "photo-1600791599208-668cd511c69c", "Maples down the block", "Benjamin Disinger", "https://unsplash.com/photos/rhZR99w1byQ"));

        var daysUntilSaturday = ((int)DayOfWeek.Saturday - (int)now.DayOfWeek + 7) % 7;
        if (daysUntilSaturday == 0)
        {
            daysUntilSaturday = 7;
        }

        var saturday = now.Date.AddDays(daysUntilSaturday);
        listing.OpenHouses.Add(new OpenHouse
        {
            Id = Guid.NewGuid(),
            ListingId = listing.Id,
            StartsAt = saturday.AddHours(11),
            EndsAt = saturday.AddHours(14),
            Notes = "Drop in. No appointment."
        });

        for (var day = 1; day <= 6; day++)
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

        var tomorrow = now.Date.AddDays(1);
        listing.Showings.Add(new Showing
        {
            Id = Guid.Parse("1847a1de-1a0e-4c0e-9a1e-1847a1d00002"),
            ListingId = listing.Id,
            StartsAt = tomorrow.AddHours(10).AddMinutes(30),
            EndsAt = tomorrow.AddHours(11),
            VisitorName = "Priya Shah",
            VisitorEmail = "priya.shah@example.com",
            VisitorPhone = "(541) 555-0172",
            Status = ShowingStatus.Booked,
            CreatedAt = now.AddDays(-1)
        });

        listing.Leads.Add(MakeLead(listing.Id, "Helen Cho", "helen.cho@example.com", "(541) 555-0104", "Could we see the porch in the late afternoon this week?", true, LeadStatus.New, now.AddDays(-1)));
        listing.Leads.Add(MakeLead(listing.Id, "Andre Walsh", "andre.walsh@example.com", "(541) 555-0166", "We are comparing this with a bungalow on Fir Street.", false, LeadStatus.Contacted, now.AddDays(-4)));
        listing.Leads.Add(MakeLead(listing.Id, "Priya Shah", "priya.shah@example.com", "(541) 555-0172", "Tomorrow works. We will come from the school.", true, LeadStatus.Showing, now.AddDays(-2)));
        listing.Leads.Add(MakeLead(listing.Id, "Jonah Peck", "jonah.peck@example.com", "(541) 555-0190", "We would like to write.", true, LeadStatus.Offer, now.AddDays(-6)));

        db.Listings.Add(listing);
        await db.SaveChangesAsync(ct);
    }

    private static string Photo(string id, int width) =>
        $"https://images.unsplash.com/{id}?auto=format&fit=crop&w={width}&q=80";

    private static ListingPhoto MakePhoto(Guid listingId, int order, string id, string caption, string credit, string creditUrl) => new()
    {
        Id = Guid.NewGuid(),
        ListingId = listingId,
        Url = Photo(id, 2000),
        Caption = caption,
        CreditName = credit,
        CreditUrl = creditUrl,
        SortOrder = order
    };

    private static Lead MakeLead(Guid listingId, string name, string email, string phone, string message, bool preApproved, LeadStatus status, DateTime created) => new()
    {
        Id = Guid.NewGuid(),
        ListingId = listingId,
        Name = name,
        Email = email,
        Phone = phone,
        Message = message,
        PreApproved = preApproved,
        Status = status,
        CreatedAt = created
    };
}
