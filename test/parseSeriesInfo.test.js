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
  
  it('Let\'s Play Minecraft - Ep.102: Aloha', () => {
    expect(parseSeriesInfo("Let's Play Minecraft - Ep.102: Aloha")).to.deep.equal({
      series: "Let's Play Minecraft",
      episode: "102",
      rest: "Aloha"
    });
  });

  it('Mindcrack Ultra Hardcore - S3E01: Harsh Terrain', () => {
    expect(parseSeriesInfo("Mindcrack Ultra Hardcore - S3E01: Harsh Terrain")).to.deep.equal({
      series: "Mindcrack Ultra Hardcore",
  episode: "301",
      rest: "Harsh Terrain"
    });
  });

  it('Minecraft - (EATS) New Prototype', () => {
    expect(parseSeriesInfo("Minecraft - (EATS) New Prototype")).to.deep.equal({
      series: "Minecraft",
      episode: "",
      rest: "(EATS) New Prototype"
    });
  });

  it('Minecraft - FoolCraft 3 #1: Fool Me Once', () => {
    expect(parseSeriesInfo("Minecraft - FoolCraft 3 #1: Fool Me Once")).to.deep.equal({
      series: "Minecraft - FoolCraft 3",
      episode: "1",
      rest: "Fool Me Once"
    });
  });

  it('Minecraft - Nail: 2 For 1', () => {
    expect(parseSeriesInfo("Minecraft - Nail: 2 For 1")).to.deep.equal({
      series: "Minecraft - Nail",
      episode: "",
      rest: "2 For 1"
    });
  });
});