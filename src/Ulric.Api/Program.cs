using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.FileProviders;
using Ulric.Api.Data;
using Ulric.Api.Services;
using Ulric.Api.Spa;

var builder = WebApplication.CreateBuilder(args);

builder.Services.ConfigureHttpJsonOptions(options =>
{
    options.SerializerOptions.Converters.Add(new JsonStringEnumConverter(JsonNamingPolicy.CamelCase));
});
builder.Services.AddControllers().AddJsonOptions(options =>
{
    options.JsonSerializerOptions.Converters.Add(new JsonStringEnumConverter(JsonNamingPolicy.CamelCase));
});
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();

var databaseProvider = builder.Configuration["Database:Provider"] ?? "Sqlite";
var useMySql = databaseProvider.Equals("MySql", StringComparison.OrdinalIgnoreCase);
if (useMySql)
{
    var mysql = builder.Configuration.GetConnectionString("MySql")
        ?? throw new InvalidOperationException("Set ConnectionStrings:MySql when Database:Provider is MySql.");
    var serverVersion = await ResolveMySqlVersion(mysql, builder.Configuration["Database:ServerVersion"]);
    builder.Services.AddDbContext<UlricDbContext>(options =>
        options.UseMySql(mysql, serverVersion, mysqlOptions =>
            mysqlOptions.EnableRetryOnFailure(5, TimeSpan.FromSeconds(2), null)));
}
else
{
    var connectionString = ResolveSqlite(
        builder.Configuration.GetConnectionString("Ulric") ?? "Data Source=ulric.db",
        builder.Environment.ContentRootPath);
    builder.Services.AddDbContext<UlricDbContext>(options => options.UseSqlite(connectionString));
}
builder.Services.Configure<GeocodingOptions>(builder.Configuration.GetSection("Geocoding"));
builder.Services.AddHttpClient<NominatimGeocoder>((sp, client) =>
{
    var geocoding = sp.GetRequiredService<Microsoft.Extensions.Options.IOptions<GeocodingOptions>>().Value;
    client.Timeout = TimeSpan.FromSeconds(8);
    client.DefaultRequestHeaders.TryAddWithoutValidation("User-Agent", geocoding.UserAgent);
    client.DefaultRequestHeaders.Accept.ParseAdd("application/json");
});
builder.Services.AddScoped<ListingService>();
builder.Services.AddScoped<BookingService>();
builder.Services.AddScoped<ListingFlyer>();
builder.Services.AddScoped<ILeadNotifier, LoggingLeadNotifier>();

var origins = builder.Configuration.GetSection("Cors:Origins").Get<string[]>() ?? ["http://localhost:4200"];
builder.Services.AddCors(options =>
{
    options.AddPolicy("studio", policy => policy.WithOrigins(origins).AllowAnyHeader().AllowAnyMethod());
});

builder.WebHost.ConfigureKestrel(options => options.Limits.MaxRequestBodySize = 12 * 1024 * 1024);

var app = builder.Build();

Directory.CreateDirectory(UploadsControllerRoot(app));
await using (var scope = app.Services.CreateAsyncScope())
{
    var db = scope.ServiceProvider.GetRequiredService<UlricDbContext>();
    if (useMySql)
    {
        for (var attempt = 1; ; attempt++)
        {
            try
            {
                await db.Database.MigrateAsync();
                break;
            }
            catch (Exception) when (attempt < 12)
            {
                await Task.Delay(TimeSpan.FromSeconds(2));
            }
        }
    }
    else
    {
        await db.Database.MigrateAsync();
    }

    await DbSeeder.SeedAsync(db);
}

if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

var pathBase = app.Configuration["PathBase"];
if (!string.IsNullOrWhiteSpace(pathBase))
{
    app.UsePathBase(pathBase);
}

app.UseCors("studio");
app.UseStaticFiles();
var uploadRoot = UploadsControllerRoot(app);
app.UseStaticFiles(new StaticFileOptions
{
    FileProvider = new PhysicalFileProvider(uploadRoot),
    RequestPath = "/uploads"
});
app.UseRouting();
app.MapControllers();
app.MapFallback(async (HttpContext context, UlricDbContext db, CancellationToken ct) =>
{
    var path = context.Request.Path.Value ?? "/";
    if (path.StartsWith("/api", StringComparison.OrdinalIgnoreCase) || path.StartsWith("/uploads", StringComparison.OrdinalIgnoreCase))
    {
        context.Response.StatusCode = StatusCodes.Status404NotFound;
        return;
    }

    var webRoot = string.IsNullOrEmpty(app.Environment.WebRootPath)
        ? Path.Combine(app.Environment.ContentRootPath, "wwwroot")
        : app.Environment.WebRootPath;
    var indexPath = Path.Combine(webRoot, "index.html");
    context.Response.ContentType = "text/html; charset=utf-8";
    if (!File.Exists(indexPath))
    {
        await context.Response.WriteAsync("Ulric API is running. Start the Angular app with ng serve for the studio UI.", ct);
        return;
    }

    var html = await File.ReadAllTextAsync(indexPath, ct);
    if (path.StartsWith("/p/", StringComparison.OrdinalIgnoreCase))
    {
        var slug = path["/p/".Length..].Split('/', '?')[0];
        html = await OgInjector.InjectAsync(html, slug, db, context.Request, app.Configuration["PublicBaseUrl"], ct);
    }

    await context.Response.WriteAsync(html, ct);
});

app.Run();

static async Task<ServerVersion> ResolveMySqlVersion(string connectionString, string? configured)
{
    if (!string.IsNullOrWhiteSpace(configured) &&
        !configured.Equals("AutoDetect", StringComparison.OrdinalIgnoreCase))
    {
        return ServerVersion.Parse(configured);
    }

    Exception? last = null;
    for (var attempt = 1; attempt <= 12; attempt++)
    {
        try
        {
            return ServerVersion.AutoDetect(connectionString);
        }
        catch (Exception ex) when (attempt < 12)
        {
            last = ex;
            await Task.Delay(TimeSpan.FromSeconds(2));
        }
    }

    throw new InvalidOperationException("Could not detect the MySQL server version.", last);
}

static string ResolveSqlite(string connectionString, string contentRoot)
{
    var builder = new SqliteConnectionStringBuilder(connectionString);
    if (string.IsNullOrWhiteSpace(builder.DataSource) || builder.DataSource == ":memory:" || Path.IsPathRooted(builder.DataSource))
    {
        return builder.ToString();
    }

    builder.DataSource = Path.Combine(contentRoot, builder.DataSource);
    return builder.ToString();
}

static string UploadsControllerRoot(WebApplication app)
{
    var configured = app.Configuration["Storage:Root"] ?? "App_Data/uploads";
    var root = Path.IsPathRooted(configured) ? configured : Path.Combine(app.Environment.ContentRootPath, configured);
    return root;
}
