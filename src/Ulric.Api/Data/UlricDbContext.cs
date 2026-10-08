using Microsoft.EntityFrameworkCore;
using Ulric.Api.Models;

namespace Ulric.Api.Data;

public sealed class UlricDbContext(DbContextOptions<UlricDbContext> options) : DbContext(options)
{
    public DbSet<Listing> Listings => Set<Listing>();
    public DbSet<ListingPhoto> Photos => Set<ListingPhoto>();
    public DbSet<OpenHouse> OpenHouses => Set<OpenHouse>();
    public DbSet<ShowingWindow> ShowingWindows => Set<ShowingWindow>();
    public DbSet<Showing> Showings => Set<Showing>();
    public DbSet<Lead> Leads => Set<Lead>();
    public DbSet<GeocodeCacheEntry> GeocodeCache => Set<GeocodeCacheEntry>();

    protected override void OnModelCreating(ModelBuilder model)
    {
        model.Entity<Listing>(entity =>
        {
            entity.HasIndex(listing => listing.Slug).IsUnique();
            entity.Property(listing => listing.Street).HasMaxLength(200);
            entity.Property(listing => listing.Slug).HasMaxLength(120);
            entity.Property(listing => listing.Theme).HasMaxLength(40);
            entity.Property(listing => listing.Price).HasPrecision(12, 2);
            entity.Property(listing => listing.Beds).HasPrecision(4, 1);
            entity.Property(listing => listing.Baths).HasPrecision(4, 1);
            entity.Property(listing => listing.LotAcres).HasPrecision(6, 2);
            entity.Property(listing => listing.Schools).HasMaxLength(2000);
            entity.Property(listing => listing.Parks).HasMaxLength(2000);
            entity.HasMany(listing => listing.Photos)
                .WithOne(photo => photo.Listing!)
                .HasForeignKey(photo => photo.ListingId)
                .OnDelete(DeleteBehavior.Cascade);
            entity.HasMany(listing => listing.OpenHouses)
                .WithOne(openHouse => openHouse.Listing!)
                .HasForeignKey(openHouse => openHouse.ListingId)
                .OnDelete(DeleteBehavior.Cascade);
            entity.HasMany(listing => listing.ShowingWindows)
                .WithOne(window => window.Listing!)
                .HasForeignKey(window => window.ListingId)
                .OnDelete(DeleteBehavior.Cascade);
            entity.HasMany(listing => listing.Showings)
                .WithOne(showing => showing.Listing!)
                .HasForeignKey(showing => showing.ListingId)
                .OnDelete(DeleteBehavior.Cascade);
            entity.HasMany(listing => listing.Leads)
                .WithOne(lead => lead.Listing!)
                .HasForeignKey(lead => lead.ListingId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        model.Entity<GeocodeCacheEntry>(entity =>
        {
            entity.HasKey(entry => entry.Query);
            entity.Property(entry => entry.Query).HasMaxLength(191);
        });
    }
}
