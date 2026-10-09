using System.Globalization;
using QuestPDF.Fluent;
using QuestPDF.Helpers;
using QuestPDF.Infrastructure;
using Ulric.Api.Contracts;
using Ulric.Api.Models;

namespace Ulric.Api.Services;

public sealed class ListingFlyer
{
    static ListingFlyer()
    {
        QuestPDF.Settings.License = LicenseType.Community;
    }

    public byte[] Render(Listing listing)
    {
        var culture = CultureInfo.GetCultureInfo("en-US");
        var price = listing.Price.ToString("C0", culture);
        var facts = $"{Trim(listing.Beds)} bd  ·  {Trim(listing.Baths)} ba  ·  {listing.SquareFeet:N0} sq ft  ·  {listing.LotAcres:0.##} acres  ·  {listing.YearBuilt}";
        var features = ListingMapper.Unpack(listing.FeaturesJson);

        return Document.Create(container =>
        {
            container.Page(page =>
            {
                page.Size(PageSizes.Letter);
                page.Margin(48);
                page.DefaultTextStyle(text => text.FontSize(11).FontColor(Colors.Grey.Darken4));
                page.Header().Row(row =>
                {
                    row.RelativeItem().Text("Ulric studio").FontSize(14).SemiBold();
                    row.ConstantItem(160).AlignRight().Text("Listing folio").FontSize(10).FontColor(Colors.Grey.Darken1);
                });
                page.Content().PaddingVertical(18).Column(column =>
                {
                    column.Spacing(8);
                    column.Item().Text(listing.Street).FontSize(28).SemiBold();
                    column.Item().Text($"{listing.City}, {listing.State} {listing.PostalCode}").FontSize(13);
                    column.Item().PaddingTop(4).Text(price).FontSize(16);
                    if (!string.IsNullOrWhiteSpace(listing.Headline))
                    {
                        column.Item().Text(listing.Headline).Italic().FontSize(13);
                    }

                    column.Item().PaddingTop(6).LineHorizontal(1).LineColor(Colors.Grey.Lighten2);
                    column.Item().Text(facts);
                    column.Item().PaddingTop(8).Text(listing.Description);
                    if (features.Count > 0)
                    {
                        column.Item().PaddingTop(8).Text("Features and amenities").SemiBold();
                        foreach (var feature in features)
                        {
                            column.Item().Text($"·  {feature}");
                        }
                    }

                    column.Item().PaddingTop(14).Text(listing.AgentName).SemiBold();
                    column.Item().Text(listing.AgentBrokerage);
                    column.Item().Text(string.Join("  ·  ", new[] { listing.AgentPhone, listing.AgentEmail }.Where(part => part.Length > 0)));
                });
                page.Footer().AlignCenter().Text("Printed from Ulric studio. This page is a summary, not an offer.").FontSize(9).FontColor(Colors.Grey.Darken1);
            });
        }).GeneratePdf();
    }

    private static string Trim(decimal value) => value == decimal.Truncate(value) ? value.ToString("0") : value.ToString("0.##");
}
