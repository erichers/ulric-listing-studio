using Ulric.Api.Services;

namespace Ulric.Api.Tests;

public class SlugGeneratorTests
{
    [Fact]
    public void Address_becomes_a_lowercase_hyphenated_slug()
    {
        var slug = SlugGenerator.FromAddress("1847 Alder Lane", "Cedarwick");

        Assert.Equal("1847-alder-lane-cedarwick", slug);
    }

    [Fact]
    public void Punctuation_and_extra_space_collapse()
    {
        var slug = SlugGenerator.FromAddress("12 Oak St.", "St. Paul");

        Assert.Equal("12-oak-st-st-paul", slug);
    }

    [Fact]
    public void Apostrophes_do_not_survive()
    {
        Assert.Equal("o-brien-court-portland", SlugGenerator.FromAddress("O'Brien Court", "Portland"));
    }

    [Fact]
    public void Empty_address_falls_back_to_listing()
    {
        Assert.Equal("listing", SlugGenerator.FromAddress("   ", ""));
    }

    [Fact]
    public void A_taken_slug_gets_the_next_free_suffix()
    {
        var existing = new[] { "1847-alder-lane-cedarwick", "1847-alder-lane-cedarwick-2" };

        var slug = SlugGenerator.EnsureUnique("1847-alder-lane-cedarwick", existing);

        Assert.Equal("1847-alder-lane-cedarwick-3", slug);
    }

    [Fact]
    public void An_open_slug_is_kept()
    {
        Assert.Equal("listing", SlugGenerator.EnsureUnique("listing", ["other"]));
    }
}
