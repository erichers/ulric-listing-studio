using Ulric.Api.Models;

namespace Ulric.Api.Services;

public interface ILeadNotifier
{
    string Name { get; }
    Task NotifyAsync(Lead lead, Listing listing, CancellationToken ct);
}

public sealed class LoggingLeadNotifier(ILogger<LoggingLeadNotifier> logger) : ILeadNotifier
{
    public string Name => "log";

    public Task NotifyAsync(Lead lead, Listing listing, CancellationToken ct)
    {
        logger.LogInformation(
            "Lead {LeadId} for {Slug} from {Name} <{Email}>. No email was sent. Notifier mode is log.",
            lead.Id,
            listing.Slug,
            lead.Name,
            lead.Email);
        return Task.CompletedTask;
    }
}
