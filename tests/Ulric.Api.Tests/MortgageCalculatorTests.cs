using Ulric.Api.Services;

namespace Ulric.Api.Tests;

public class MortgageCalculatorTests
{
    [Fact]
    public void Standard_thirty_year_loan_matches_the_known_payment()
    {
        var result = MortgageCalculator.Calculate(new MortgageInput(200000, 0, 6, 30, 0, 0, 0));

        Assert.Equal(200000, result.LoanAmount);
        Assert.Equal(1199.10m, result.MonthlyPrincipalAndInterest);
        Assert.Equal(1199.10m, result.TotalMonthly);
    }

    [Fact]
    public void Zero_interest_divides_the_loan_across_the_term()
    {
        var result = MortgageCalculator.Calculate(new MortgageInput(200000, 0, 0, 30, 0, 0, 0));

        Assert.Equal(555.56m, result.MonthlyPrincipalAndInterest);
    }

    [Fact]
    public void Taxes_insurance_and_hoa_are_added_to_the_monthly_total()
    {
        var result = MortgageCalculator.Calculate(new MortgageInput(200000, 0, 6, 30, 2400, 1200, 75));

        Assert.Equal(200m, result.MonthlyTax);
        Assert.Equal(100m, result.MonthlyInsurance);
        Assert.Equal(75m, result.MonthlyHoa);
        Assert.Equal(1574.10m, result.TotalMonthly);
    }

    [Fact]
    public void Full_down_payment_leaves_only_the_carrying_costs()
    {
        var result = MortgageCalculator.Calculate(new MortgageInput(875000, 875000, 6.5m, 30, 9600, 1800, 0));

        Assert.Equal(0, result.LoanAmount);
        Assert.Equal(0, result.MonthlyPrincipalAndInterest);
        Assert.Equal(950m, result.TotalMonthly);
    }

    [Fact]
    public void Down_payment_above_the_price_is_rejected()
    {
        var error = Assert.Throws<ArgumentOutOfRangeException>(() =>
            MortgageCalculator.Calculate(new MortgageInput(100000, 100001, 6, 30, 0, 0, 0)));

        Assert.Contains("Down payment", error.Message);
    }

    [Theory]
    [InlineData(-1, 0, 6, 30)]
    [InlineData(100000, -1, 6, 30)]
    [InlineData(100000, 0, -1, 30)]
    [InlineData(100000, 0, 6, 0)]
    public void Invalid_numbers_are_rejected(int price, int down, int rate, int years)
    {
        Assert.Throws<ArgumentOutOfRangeException>(() =>
            MortgageCalculator.Calculate(new MortgageInput(price, down, rate, years, 0, 0, 0)));
    }
}
