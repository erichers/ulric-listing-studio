using System.Globalization;
using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.Extensions.Options;
using Ulric.Api.Data;
using Ulric.Api.Models;

namespace Ulric.Api.Services;

public sealed class GeocodingOptions
{
    public bool Enabled { get; set; } = true;
    public string UserAgent { get; set; } = "UlricListingStudio/1.0 (+https://github.com/erichers/ulric-listing-studio)";
    public string BaseUrl { get; set; } = "https://nominatim.openstreetmap.org";
    public int MinIntervalMs { get; set; } = 1100;
}

public sealed class NominatimGeocoder(
    HttpClient http,
    UlricDbContext db,
    IOptions<GeocodingOptions> options,
    ILogger<NominatimGeocoder> logger)
{
    private static readonly SemaphoreSlim Gate = new(1, 1);
    private static DateTime nextUtc = DateTime.MinValue;

    public async Task<(double Latitude, double Longitude)?> LookupAsync(string query, CancellationToken ct)
    {
        var settings = options.Value;
        if (!settings.Enabled || string.IsNullOrWhiteSpace(query))
        {
            return null;
        }

        var key = Normalize(query);
        var cached = await db.GeocodeCache.FindAsync([key], ct);
        if (cached is not null)
        {
            return cached.Found && cached.Latitude is not null && cached.Longitude is not null
                ? (cached.Latitude.Value, cached.Longitude.Value)
                : null;
        }

        await WaitForPolicyAsync(settings.MinIntervalMs, ct);

        try
        {
            var url = $"{settings.BaseUrl.TrimEnd('/')}/search?format=jsonv2&limit=1&q={Uri.EscapeDataString(query)}";
            using var response = await http.GetAsync(url, ct);
            if (!response.IsSuccessStatusCode)
            {
                logger.LogWarning("Nominatim returned {Status} for {Query}. The result was not cached.", (int)response.StatusCode, key);
                return null;
            }

            var json = await response.Content.ReadAsStringAsync(ct);
            var rows = JsonSerializer.Deserialize<List<NominatimHit>>(json);
            var hit = rows?.FirstOrDefault();
            var entry = new GeocodeCacheEntry
            {
                Query = key,
                FetchedAt = DateTime.UtcNow
            };

            if (hit is not null
                && double.TryParse(hit.Lat, NumberStyles.Float, CultureInfo.InvariantCulture, out var lat)
                && double.TryParse(hit.Lon, NumberStyles.Float, CultureInfo.InvariantCulture, out var lon))
            {
                entry.Found = true;
                entry.Latitude = lat;
                entry.Longitude = lon;
                entry.DisplayName = hit.DisplayName;
                db.GeocodeCache.Add(entry);
                await db.SaveChangesAsync(ct);
                return (lat, lon);
            }

            entry.Found = false;
            db.GeocodeCache.Add(entry);
            await db.SaveChangesAsync(ct);
            return null;
        }
        catch (Exception ex) when (ex is HttpRequestException or TaskCanceledException or JsonException)
        {
            logger.LogWarning(ex, "Nominatim lookup failed for {Query}", key);
            return null;
        }
    }

    private static async Task WaitForPolicyAsync(int minIntervalMs, CancellationToken ct)
    {
        var gap = TimeSpan.FromMilliseconds(Math.Max(1100, minIntervalMs));
        await Gate.WaitAsync(ct);
        try
        {
            var wait = nextUtc - DateTime.UtcNow;
            if (wait > TimeSpan.Zero)
            {
                await Task.Delay(wait, ct);
            }

            nextUtc = DateTime.UtcNow.Add(gap);
        }
        finally
        {
            Gate.Release();
        }
    }

    public static string Normalize(string query)
    {
        var collapsed = string.Join(' ', query.Split(' ', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries));
        var key = collapsed.ToLowerInvariant();
        // 191 utf8mb4 characters stay under the 767-byte InnoDB index limit on MySQL 5.7.
        return key.Length <= 191 ? key : key[..191];
    }

    private sealed class NominatimHit
    {
        [JsonPropertyName("lat")]
        public string? Lat { get; set; }

        [JsonPropertyName("lon")]
        public string? Lon { get; set; }

        [JsonPropertyName("display_name")]
        public string? DisplayName { get; set; }
    }
}
