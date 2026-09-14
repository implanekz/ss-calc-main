import { computeDrawdownSeries, computeNestEggNeeded } from './RetirementIncomeNeedsApp';

describe('computeDrawdownSeries', () => {
  it('spans every age from retirementAge to planUntilAge', () => {
    const series = computeDrawdownSeries({
      retirementAge: 62,
      planUntilAge: 95,
      startingBalance: 1000000,
      grossFirstYearIncome: 50000,
      incomeInflation: 0.03,
      assumedReturnRetirement: 0.05,
    });
    expect(series).toHaveLength(95 - 62 + 1);
    expect(series[0]).toEqual({ age: 62, balance: 1000000 });
    expect(series.map((row) => row.age)).toEqual(
      Array.from({ length: 34 }, (_, i) => 62 + i)
    );
  });

  it('depletes to ~0 by planUntilAge when starting balance exactly matches the nest egg needed', () => {
    const inputs = {
      annualIncomeGoalToday: 50000,
      retirementAge: 62,
      currentAge: 60,
      planUntilAge: 95,
      incomeInflation: 0.03,
      assumedReturnRetirement: 0.05,
      taxRate: 0.15,
    };
    const { nestEgg, grossFirstYearIncome } = computeNestEggNeeded(inputs);

    const series = computeDrawdownSeries({
      retirementAge: inputs.retirementAge,
      planUntilAge: inputs.planUntilAge,
      startingBalance: nestEgg,
      grossFirstYearIncome,
      incomeInflation: inputs.incomeInflation,
      assumedReturnRetirement: inputs.assumedReturnRetirement,
    });

    const finalBalance = series[series.length - 1].balance;
    expect(Math.abs(finalBalance)).toBeLessThan(1);
  });

  it('goes negative when the starting balance falls short of the nest egg needed', () => {
    const series = computeDrawdownSeries({
      retirementAge: 62,
      planUntilAge: 95,
      startingBalance: 100000,
      grossFirstYearIncome: 58824,
      incomeInflation: 0.03,
      assumedReturnRetirement: 0.05,
    });
    expect(series[series.length - 1].balance).toBeLessThan(0);
  });
});
