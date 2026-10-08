using System.Text.RegularExpressions;

namespace Ulric.Api.Services;

public static partial class SlugGenerator
{
    public static string FromAddress(string? street, string? city)
    {
        var raw = $"{street} {city}".Trim().ToLowerInvariant();
        var slug = NonSlug().Replace(raw, "-").Trim('-');
        if (slug.Length > 80)
        {
            slug = slug[..80].Trim('-');
        }

        return slug.Length == 0 ? "listing" : slug;
    }

    public static string EnsureUnique(string slug, IEnumerable<string> existing)
    {
        var taken = new HashSet<string>(
            existing.Where(value => !string.IsNullOrWhiteSpace(value)),
            StringComparer.OrdinalIgnoreCase);

        if (!taken.Contains(slug))
        {
            return slug;
        }

        for (var suffix = 2; suffix < 10000; suffix++)
        {
            var candidate = $"{slug}-{suffix}";
            if (!taken.Contains(candidate))
            {
                return candidate;
            }
        }

        return $"{slug}-{Guid.NewGuid():N}"[..Math.Min(80, slug.Length + 9)];
    }

    [GeneratedRegex("[^a-z0-9]+", RegexOptions.CultureInvariant)]
    private static partial Regex NonSlug();
}
