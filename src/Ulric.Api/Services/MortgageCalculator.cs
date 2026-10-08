namespace Ulric.Api.Services;

public sealed record MortgageInput(
    decimal Price,
    decimal DownPayment,
    decimal AnnualInterestRatePercent,
    int TermYears,
    decimal AnnualPropertyTax,
    decimal AnnualInsurance,
    decimal MonthlyHoa);

public sealed record MortgageResult(
    decimal LoanAmount,
    decimal MonthlyPrincipalAndInterest,
    decimal MonthlyTax,
    decimal MonthlyInsurance,
    decimal MonthlyHoa,
    decimal TotalMonthly);

public static class MortgageCalculator
{
    public static MortgageResult Calculate(MortgageInput input)
    {
        if (input.Price < 0)
        {
            throw new ArgumentOutOfRangeException(nameof(input), "Price cannot be negative.");
        }

        if (input.DownPayment < 0 || input.DownPayment > input.Price)
        {
            throw new ArgumentOutOfRangeException(nameof(input), "Down payment must be between zero and the price.");
        }

        if (input.AnnualInterestRatePercent < 0)
        {
            throw new ArgumentOutOfRangeException(nameof(input), "Interest rate cannot be negative.");
        }

        if (input.TermYears is < 1 or > 50)
        {
            throw new ArgumentOutOfRangeException(nameof(input), "Term must be between 1 and 50 years.");
        }

        if (input.AnnualPropertyTax < 0 || input.AnnualInsurance < 0 || input.MonthlyHoa < 0)
        {
            throw new ArgumentOutOfRangeException(nameof(input), "Tax, insurance, and HOA cannot be negative.");
        }

        var loan = input.Price - input.DownPayment;
        var months = input.TermYears * 12;
        var monthlyRate = input.AnnualInterestRatePercent / 100m / 12m;
        decimal principalAndInterest;

        if (loan == 0)
        {
            principalAndInterest = 0;
        }
        else if (monthlyRate == 0)
        {
            principalAndInterest = loan / months;
        }
        else
        {
            var rate = (double)monthlyRate;
            var factor = Math.Pow(1 + rate, months);
            principalAndInterest = (decimal)((double)loan * rate * factor / (factor - 1));
        }

        var payment = Round(principalAndInterest);
        var tax = Round(input.AnnualPropertyTax / 12m);
        var insurance = Round(input.AnnualInsurance / 12m);
        var hoa = Round(input.MonthlyHoa);

        return new MortgageResult(loan, payment, tax, insurance, hoa, payment + tax + insurance + hoa);
    }

    private static decimal Round(decimal value) => Math.Round(value, 2, MidpointRounding.AwayFromZero);
}
