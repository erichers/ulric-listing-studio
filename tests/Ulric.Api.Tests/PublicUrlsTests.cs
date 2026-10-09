using Microsoft.AspNetCore.Http;
using Ulric.Api.Services;

namespace Ulric.Api.Tests;

public class PublicUrlsTests
{
    [Fact]
    public void Apply_strips_a_leading_slash_when_no_public_base_is_set()
    {
        Assert.Equal("media/porch.jpg", PublicUrls.Apply("/media/porch.jpg", null));
        Assert.Equal("uploads/photo.jpg", PublicUrls.Apply("uploads/photo.jpg", "  "));
        Assert.Equal("api/showings/1/calendar.ics", PublicUrls.Apply("/api/showings/1/calendar.ics", ""));
    }

    [Fact]
    public void Apply_prefixes_a_configured_public_base()
    {
        const string baseUrl = "http://localhost:8888/apps/ulric-listing-studio/";
        Assert.Equal(
            "http://localhost:8888/apps/ulric-listing-studio/p/418-larkspur-way-fernhollow",
            PublicUrls.Apply("/p/418-larkspur-way-fernhollow", baseUrl));
    }

    [Fact]
    public void Apply_leaves_absolute_urls_alone()
    {
        const string url = "https://images.example/house.jpg";
        Assert.Equal(url, PublicUrls.Apply(url, "http://localhost:8888/apps/ulric-listing-studio"));
    }

    [Fact]
    public void Location_uses_the_request_path_base_when_public_base_is_empty()
    {
        var context = new DefaultHttpContext();
        context.Request.PathBase = "/apps/ulric-listing-studio";
        Assert.Equal(
            "/apps/ulric-listing-studio/api/listings/abc",
            PublicUrls.Location(context.Request, null, "api/listings/abc"));
    }
}
