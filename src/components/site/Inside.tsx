"use client";

import { useState } from "react";

/*
 * "What's inside" as three columns of names at one size. Pointing at (or
 * focusing) a name brings it to full ink and shows its line in the empty
 * columns on the right. On a phone the descriptions are dropped and each group
 * keeps one summary sentence.
 *
 * The formula is sample content for the demo product; replace before launch.
 */
const GROUPS: { name: string; summary: string; items: [string, string][] }[] = [
  {
    name: "In the scoop",
    summary: "Six ingredients, every one on the label with its amount.",
    items: [
      ["Creatine monohydrate", "3 g in every 10 g scoop."],
      ["Electrolyte blend", "Sodium, potassium and magnesium, 600 mg together."],
      ["Magnesium glycinate", "150 mg, the gentle form."],
      ["Vitamin D3", "25 µg per scoop."],
      ["Citric acid", "Flavoured tubs only, for a clean finish."],
      ["Natural flavour", "Black cherry or citrus salt; none in Unflavoured."],
    ],
  },
  {
    name: "Left out",
    summary: "No sugar, no colour, nothing hidden in a blend.",
    items: [
      ["Added sugar", "None, in any flavour."],
      ["Artificial colours", "The powder is the colour it is."],
      ["Sweeteners", "Not sucralose, not anything."],
      ["Fillers", "No maltodextrin to bulk the scoop."],
      ["Proprietary blends", "Every amount is printed, nothing grouped."],
    ],
  },
  {
    name: "The tub",
    summary: "One tub is one month, and it closes with a quarter turn.",
    items: [
      ["300 g of powder", "Thirty scoops of 10 g each."],
      ["Measured scoop", "Packed inside, on top of the powder."],
      ["Foil seal", "Under the lid until you open it."],
      ["Quarter-turn lid", "Closes tight with one twist."],
      ["Recyclable tub", "Polypropylene, number 5."],
    ],
  },
];

export function Inside() {
  const [active, setActive] = useState<[string, string]>(GROUPS[0].items[0]);
  return (
    <section id="inside" className="sec inside" aria-labelledby="inside-title" tabIndex={-1}>
      <div className="grid12" data-reveal>
        <h2 id="inside-title" className="h2 inside__head" data-split>What&rsquo;s inside</h2>
        {GROUPS.map((g) => (
          <div className="inside__col" key={g.name} data-r>
            <h3>{g.name}</h3>
            <ul>
              {g.items.map((it) => (
                <li
                  key={it[0]}
                  tabIndex={0}
                  aria-current={active[0] === it[0]}
                  onMouseEnter={() => setActive(it)}
                  onFocus={() => setActive(it)}
                >
                  {it[0]}
                </li>
              ))}
            </ul>
            <p className="small muted" style={{ marginTop: 16 }}>{g.summary}</p>
          </div>
        ))}
        <p className="inside__detail" aria-live="polite" data-r>
          <b>{active[0]}</b>
          {active[1]}
        </p>
        <p className="inside__note small muted" data-r>
          Amounts are per 10 g scoop. No.3 is a demo product; this formula is a sample.
        </p>
      </div>
    </section>
  );
}
