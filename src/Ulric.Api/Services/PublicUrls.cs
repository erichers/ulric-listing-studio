namespace Ulric.Api.Services;

public static class PublicUrls
{
    public static string Apply(string? path, string? publicBaseUrl)
    {
        if (string.IsNullOrWhiteSpace(path))
        {
            return "";
        }

        if (path.StartsWith("http://", StringComparison.OrdinalIgnoreCase) ||
            path.StartsWith("https://", StringComparison.OrdinalIgnoreCase))
        {
            return path;
        }

        var relative = path.TrimStart('/');
        if (string.IsNullOrWhiteSpace(publicBaseUrl))
        {
            return relative;
        }

        return publicBaseUrl.TrimEnd('/') + "/" + relative;
    }

    public static string Location(HttpRequest request, string? publicBaseUrl, string relativePath)
    {
        var relative = relativePath.TrimStart('/');
        if (!string.IsNullOrWhiteSpace(publicBaseUrl))
        {
            return publicBaseUrl.TrimEnd('/') + "/" + relative;
        }

        var pathBase = request.PathBase.Value?.TrimEnd('/') ?? "";
        return pathBase + "/" + relative;
    }
}
