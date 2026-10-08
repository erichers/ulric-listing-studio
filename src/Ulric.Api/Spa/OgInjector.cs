using System.Net;
using System.Text.RegularExpressions;
using Microsoft.EntityFrameworkCore;
using Ulric.Api.Data;
using Ulric.Api.Models;

namespace Ulric.Api.Spa;

public static partial class OgInjector
{
    public static async Task<string> InjectAsync(string html, string slug, UlricDbContext db, HttpRequest request, CancellationToken ct)
    {
        var listing = await db.Listings
            .Include(item => item.Photos)
            .FirstOrDefaultAsync(item => item.Slug == slug && item.Status == ListingStatus.Published, ct);

        if (listing is null)
        {
            return html;
        }

        var baseUrl = $"{request.Scheme}://{request.Host}";
        var image = listing.Photos.OrderBy(photo => photo.SortOrder).Select(photo => photo.Url).FirstOrDefault() ?? "";
        if (image.StartsWith('/'))
        {
            image = baseUrl + image;
        }

        var title = string.IsNullOrWhiteSpace(listing.City) ? listing.Street : $"{listing.Street}, {listing.City}";
        var description = string.IsNullOrWhiteSpace(listing.Headline) ? listing.Description : listing.Headline;
        description = description.Replace('\n', ' ').Trim();
        if (description.Length > 200)
        {
            description = description[..197] + "...";
        }

        var block = $"""
            <title>{E(title)} | Ulric studio</title>
            <meta name="description" content="{E(description)}" />
            <meta property="og:title" content="{E(title)}" />
            <meta property="og:description" content="{E(description)}" />
            <meta property="og:type" content="website" />
            <meta property="og:url" content="{E($"{baseUrl}/p/{listing.Slug}")}" />
            <meta property="og:image" content="{E(image)}" />
            <meta name="twitter:card" content="summary_large_image" />
            """;

        if (html.Contains("<!--ulric:head-->", StringComparison.Ordinal))
        {
            return HeadBlock().Replace(html, block);
        }

        return html.Replace("</head>", block + "</head>", StringComparison.OrdinalIgnoreCase);
    }

    private static string E(string value) => WebUtility.HtmlEncode(value);

    [GeneratedRegex("<!--ulric:head-->.*?<!--/ulric:head-->", RegexOptions.Singleline)]
    private static partial Regex HeadBlock();
}
