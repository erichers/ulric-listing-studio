using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;

namespace Ulric.Api.Data;

public sealed class UlricDbContextFactory : IDesignTimeDbContextFactory<UlricDbContext>
{
    public UlricDbContext CreateDbContext(string[] args)
    {
        var options = new DbContextOptionsBuilder<UlricDbContext>();
        // Design-time only. Migrations are generated from the model. This string is not used to connect.
        options.UseMySql(
            "Server=127.0.0.1;Database=ulric;User=design;Password=CHANGE_ME",
            ServerVersion.Parse("5.7.39-mysql"));
        return new UlricDbContext(options.Options);
    }
}
