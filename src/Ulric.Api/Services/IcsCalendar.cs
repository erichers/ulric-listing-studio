using Ulric.Api.Models;

namespace Ulric.Api.Services;

public static class IcsCalendar
{
    public static string Build(Showing showing, Listing listing)
    {
        var stamp = DateTime.UtcNow.ToString("yyyyMMdd'T'HHmmss'Z'");
        var summary = $"Showing at {listing.Street}";
        var location = string.Join(", ", new[] { listing.Street, listing.City, listing.State, listing.PostalCode }
            .Where(part => !string.IsNullOrWhiteSpace(part)));
        var description = $"Showing with {listing.AgentName}. Booked through Ulric studio.";

        return string.Join("\r\n",
        [
            "BEGIN:VCALENDAR",
            "VERSION:2.0",
            "PRODID:-//Ulric studio//Listing Studio//EN",
            "CALSCALE:GREGORIAN",
            "METHOD:PUBLISH",
            "BEGIN:VEVENT",
            $"UID:{showing.Id}@ulric.studio",
            $"DTSTAMP:{stamp}",
            $"DTSTART:{showing.StartsAt:yyyyMMdd'T'HHmmss}",
            $"DTEND:{showing.EndsAt:yyyyMMdd'T'HHmmss}",
            $"SUMMARY:{Escape(summary)}",
            $"LOCATION:{Escape(location)}",
            $"DESCRIPTION:{Escape(description)}",
            "END:VEVENT",
            "END:VCALENDAR",
            ""
        ]);
    }

    private static string Escape(string value) =>
        value.Replace("\\", "\\\\").Replace(";", "\\;").Replace(",", "\\,").Replace("\r\n", "\\n").Replace("\n", "\\n");
}
