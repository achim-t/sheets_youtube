const { expect } = require('chai');
const parseSeriesInfo = require('../parseSeriesInfo');

describe('parseSeriesInfo', () => {
  it('Meine Serie #12 - Das große Finale', () => {
    expect(parseSeriesInfo("Meine Serie #12 - Das große Finale")).to.deep.equal({
      series: "Meine Serie",
      episode: "12",
      rest: "Das große Finale"
    });
  });

  it('Doku-Reihe Episode 3: Die Entdeckung', () => {
    expect(parseSeriesInfo("Doku-Reihe Episode 3: Die Entdeckung")).to.deep.equal({
      series: "Doku-Reihe",
      episode: "3",
      rest: "Die Entdeckung"
    });
  });

  it('Vlog #1', () => {
    expect(parseSeriesInfo("Vlog #1")).to.deep.equal({
      series: "Vlog",
      episode: "1",
      rest: ""
    });
  });

  it('Tutorial', () => {
    expect(parseSeriesInfo("Tutorial")).to.deep.equal({
      series: "Tutorial",
      episode: "",
      rest: ""
    });
  });
});