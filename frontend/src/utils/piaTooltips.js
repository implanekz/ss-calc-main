// piaTooltips.js
// Developer-ready constants module with typed exports.

export const tooltips = {
  pia: {
    doubleHit: {
      short: {
        title: "Why did my PIA change?",
        text:
          "Claiming early cuts your check, and stopping work adds zeros to your 35-year average—both reduce your PIA.",
      },
      medium: {
        title: "The double hit",
        text:
          "SSA assumes your last income repeats to 67. If you stop at 62, those years become zeros and you also take the ~30% early-claim cut. Result: a lower PIA.",
      },
      compact: {
        title: "Why working to 67 matters",
        text:
          "SSA projects your latest earnings through FRA. If you stop at 62, 62–67 become zeros and you also get the ~30% early-claim reduction. Keep earning (even part-time) to replace low/zero years and raise your PIA.",
      },
    },
    adoptChartPia: {
      title: "Use this PIA on Show Me The Money",
      paragraphs: [
        "Your Social Security statement projects your PIA by projecting your latest year’s earnings forward to age 67. But if you stop working and file at 62, those future years are usually zeros — and you also take the ~30% early-filing cut.",
        "Together, the early filing penalty and loss of earnings from 62–67 can be more like 35–40% below the statement figure, especially if you still have zeros in your top 35.",
        "This box sends the PIA you just calculated here — including whatever future years you set — into the main chart so you can see that timing decision with this number.",
        "You can come back anytime, uncheck this, and the chart goes back to the PIA you typed from your statement. Nothing is overwritten."
      ]
    }
  },
};

export const labels = {
  toggle: {
    ssaProjection: "Assume SSA projection (repeat last year to 67)",
    stopAt62: "Stop work at 62 (zeros 62–67)",
  },
  banner: {
    summary:
      "Loaded: {file} • Years: {yearsCount} • Zeros in top-35: {zeroCount} • 61–67: {status}",
  },
};
