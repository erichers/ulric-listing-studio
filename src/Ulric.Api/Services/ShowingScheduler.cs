using Ulric.Api.Models;

namespace Ulric.Api.Services;

public sealed record ShowingSlot(DateTime StartsAt, DateTime EndsAt, bool Available);

public static class ShowingScheduler
{
    public static bool HasConflict(IEnumerable<Showing> existing, DateTime start, DateTime end)
    {
        return existing.Any(showing =>
            showing.Status == ShowingStatus.Booked &&
            showing.StartsAt < end &&
            start < showing.EndsAt);
    }

    public static IReadOnlyList<ShowingSlot> Generate(
        IEnumerable<ShowingWindow> windows,
        IEnumerable<Showing> existing,
        DateTime rangeStart,
        DateTime rangeEnd)
    {
        var bookings = existing.Where(showing => showing.Status == ShowingStatus.Booked).ToList();
        var slots = new List<ShowingSlot>();

        foreach (var window in windows.OrderBy(window => window.StartsAt))
        {
            if (window.SlotMinutes is < 15 or > 240 || window.EndsAt <= window.StartsAt)
            {
                continue;
            }

            var cursor = window.StartsAt;
            while (cursor.AddMinutes(window.SlotMinutes) <= window.EndsAt)
            {
                var end = cursor.AddMinutes(window.SlotMinutes);
                if (end > rangeStart && cursor < rangeEnd)
                {
                    slots.Add(new ShowingSlot(cursor, end, !HasConflict(bookings, cursor, end)));
                }

                cursor = end;
            }
        }

        return slots
            .GroupBy(slot => slot.StartsAt)
            .Select(group => group.First())
            .OrderBy(slot => slot.StartsAt)
            .ToList();
    }
}
