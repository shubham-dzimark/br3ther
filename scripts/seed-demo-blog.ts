/**
 * Six sample journal posts, so the blog has something to show while real
 * stories are written. Safe to run again: posts are matched by slug.
 *
 *   npx tsx scripts/seed-demo-blog.ts            # saves them as drafts
 *   npx tsx scripts/seed-demo-blog.ts --publish  # publishes them
 *   npx tsx scripts/seed-demo-blog.ts --remove   # deletes them again
 *
 * Reads DATABASE_URL from .env.
 */
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma";

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });

const AUTHOR = "The Br3thr Lounge";

const CATEGORIES = [
  { slug: "cigar-guides", name: "Cigar Guides", description: "How to choose, cut, light and keep a fine cigar." },
  { slug: "pairings", name: "Pairings", description: "What to pour beside what you smoke." },
  { slug: "lifestyle", name: "Lifestyle", description: "The rituals, the rooms and the company." },
];

const POSTS: {
  slug: string;
  title: string;
  excerpt: string;
  cover: string;
  category: string;
  tags: string[];
  daysAgo: number;
  body: string;
}[] = [
  {
    slug: "beginners-guide-to-choosing-a-cigar",
    title: "A Beginner's Guide to Choosing Your First Cigar",
    excerpt: "Wrapper, size and strength explained in plain words, so your first cigar is one you actually enjoy.",
    cover: "/br3thr/hero.jpg",
    category: "cigar-guides",
    tags: ["Beginners", "Wrappers"],
    daysAgo: 2,
    body: `<p>Walking up to a full humidor for the first time can feel like being handed a wine list in a language you don't speak. The good news: three choices decide almost everything about how a cigar will taste, and none of them need expertise.</p>
<h2>1. Start with the wrapper</h2>
<p>The wrapper is the outer leaf, and it carries much of the flavour. As a rule of thumb, the lighter the colour, the milder and creamier the smoke.</p>
<ul>
<li><strong>Connecticut</strong>: pale gold, smooth, notes of cream and cedar. The classic first cigar.</li>
<li><strong>Habano</strong>: reddish brown, a touch of spice and leather.</li>
<li><strong>Maduro</strong>: dark and oily, sweeter, with cocoa and coffee.</li>
</ul>
<h2>2. Pick a size you have time for</h2>
<p>A Robusto (around 5 inches) takes 45 minutes to an hour. A Churchill can run past ninety. For a first cigar, choose something you can finish without rushing: a Corona or Robusto is ideal.</p>
<h2>3. Go mild to medium</h2>
<p>Strength is about nicotine, not flavour. A full-bodied cigar on an empty stomach is a lesson most smokers only need once. Start mild, eat beforehand, and keep a glass of water close.</p>
<blockquote>Smoke slowly. One draw a minute keeps the cigar cool and the flavour clean.</blockquote>
<p>Most importantly, don't over-think it. The best cigar is the one you enjoy, in good company, with nowhere else to be.</p>`,
  },
  {
    slug: "how-to-cut-and-light-a-cigar",
    title: "How to Cut and Light a Cigar Like a Gentleman",
    excerpt: "A clean cut and an even toast are the difference between a cigar that sings and one that struggles.",
    cover: "/br3thr/cat-1.jpg",
    category: "cigar-guides",
    tags: ["Technique", "Accessories"],
    daysAgo: 6,
    body: `<p>You can buy the finest cigar in the room and ruin it in ten seconds with a bad cut or a rushed light. Here's how to do both properly.</p>
<h2>The cut</h2>
<p>Find the cap, the small rounded piece of leaf at the head of the cigar. Your aim is to remove just enough to open it, about 2 millimetres, without cutting past the line where the cap meets the wrapper.</p>
<ul>
<li><strong>Straight cut</strong>: the most common. A double-blade cutter gives the cleanest result.</li>
<li><strong>V-cut</strong>: a wedge that concentrates the smoke. Lovely on larger ring gauges.</li>
<li><strong>Punch</strong>: a small round hole. Neat, and it keeps loose tobacco off your tongue.</li>
</ul>
<h2>The toast</h2>
<p>Hold the foot of the cigar just above a butane or cedar flame, never in it, and rotate slowly until the edge glows evenly all the way round. Then bring it to your lips and draw gently while turning.</p>
<h3>Avoid</h3>
<p>Petrol lighters and scented candles. Both leave a taste you'll notice for the rest of the cigar.</p>
<blockquote>Take your time with the first light. It sets the burn for everything that follows.</blockquote>`,
  },
  {
    slug: "whisky-and-cigar-pairing",
    title: "The Art of Pairing Whisky with Cigars",
    excerpt: "Match weight with weight and let the flavours meet halfway. A short guide to pouring the right dram.",
    cover: "/br3thr/promo.jpg",
    category: "pairings",
    tags: ["Whisky", "Pairing"],
    daysAgo: 11,
    body: `<p>Few things sit together as naturally as a good cigar and a glass of whisky. The secret is balance: neither should drown the other.</p>
<h2>Match the weight</h2>
<p>A mild Connecticut cigar is easily overwhelmed by a heavily peated Islay. Pair it instead with a light Speyside or a soft Irish whiskey. Save the big, smoky malts for full-bodied Maduros that can stand up to them.</p>
<h2>Three pairings to try</h2>
<ul>
<li><strong>Mild Connecticut + Speyside single malt</strong>: honey, vanilla and cream.</li>
<li><strong>Medium Habano + bourbon</strong>: the spice of the leaf against caramel and oak.</li>
<li><strong>Full Maduro + sherried Highland malt</strong>: dark fruit, cocoa and a long finish.</li>
</ul>
<h2>Serve it right</h2>
<p>Pour neat or with a few drops of water to open the spirit. Ice dulls the flavour you've paid for. Sip between draws and notice how each changes the other.</p>
<blockquote>The best pairing is a conversation, not a contest.</blockquote>`,
  },
  {
    slug: "storing-cigars-humidor-guide",
    title: "Keeping Cigars Fresh: The Humidor Essentials",
    excerpt: "Seventy degrees, seventy percent. Everything you need to know to keep your collection at its best.",
    cover: "/br3thr/cat-2.jpg",
    category: "cigar-guides",
    tags: ["Storage", "Humidor"],
    daysAgo: 17,
    body: `<p>A cigar is a living thing. Left on a shelf, it dries out within days, burns hot and tastes bitter. A humidor keeps it exactly as the maker intended.</p>
<h2>The 70/70 rule</h2>
<p>Aim for about 70°F (21°C) and 65–70% relative humidity. Too dry and the wrapper cracks. Too damp and the cigar won't draw, or worse, grows mould.</p>
<h2>Setting up a new humidor</h2>
<ul>
<li>Wipe the cedar lining with distilled water, never tap water.</li>
<li>Add a humidification pack or device and close the lid for 24–48 hours.</li>
<li>Check the hygrometer before adding a single cigar.</li>
</ul>
<h2>Day-to-day care</h2>
<p>Rotate your cigars every few weeks so they age evenly, and keep the humidor away from windows and radiators. Avoid packing it to the brim: air needs room to move.</p>
<h3>Travelling?</h3>
<p>A small travel case with a humidity pack keeps cigars happy for a week or two on the road.</p>`,
  },
  {
    slug: "the-cigar-lounge-ritual",
    title: "The Lounge Ritual: Why We Slow Down",
    excerpt: "A good cigar asks for an hour of your time. Here's why that hour is worth more than ever.",
    cover: "/br3thr/club-right.jpg",
    category: "lifestyle",
    tags: ["Culture", "Ritual"],
    daysAgo: 24,
    body: `<p>Everything about modern life is built for speed. A cigar is built for the opposite. You can't hurry it, can't pause it, can't do it while scrolling. That's exactly the point.</p>
<h2>An hour that belongs to you</h2>
<p>The ritual starts long before the first draw: choosing the cigar, the clean cut, the slow toast. By the time it's lit, your shoulders have dropped and the phone is face down on the table.</p>
<h2>Better in company</h2>
<p>Some of the best conversations happen over a cigar, because nobody is in a hurry to leave. Deals are closed, friendships are made, and stories get told properly, from beginning to end.</p>
<blockquote>Nobody ever looked back on an hour spent with a good cigar and wished they'd spent it on email.</blockquote>
<h2>Making your own lounge</h2>
<p>You don't need leather armchairs and wood panelling, though they help. A comfortable chair, a quiet evening, a well-kept cigar and a glass of something good are all it takes.</p>`,
  },
  {
    slug: "coffee-and-cigars-morning-pairings",
    title: "Coffee and Cigars: The Perfect Morning Pairing",
    excerpt: "Espresso, cortado or a slow pour-over: which coffee brings out the best in your morning smoke.",
    cover: "/br3thr/cat-3.jpg",
    category: "pairings",
    tags: ["Coffee", "Pairing"],
    daysAgo: 31,
    body: `<p>Not every pairing needs a bottle. Coffee and tobacco grow in many of the same regions, and they share the same roasted, earthy notes. A morning cigar with a good cup is one of life's quiet pleasures.</p>
<h2>Light cigars, lighter coffee</h2>
<p>A mild Connecticut goes beautifully with a cortado or a flat white: the milk softens the coffee and echoes the cream in the wrapper.</p>
<h2>Bold cigars, bold coffee</h2>
<p>A Maduro calls for espresso or a dark French press. The bitterness of the roast meets the sweetness of the leaf halfway.</p>
<ul>
<li><strong>Espresso</strong>: short, intense, perfect with a Petit Corona.</li>
<li><strong>Café Cubano</strong>: sweetened espresso, a natural match for a Habano.</li>
<li><strong>Pour-over</strong>: bright and clean, for when you want to taste every note.</li>
</ul>
<blockquote>Start the day slowly, and the rest of it tends to follow.</blockquote>`,
  },
];

async function main() {
  const mode = process.argv.includes("--remove") ? "remove" : process.argv.includes("--publish") ? "publish" : "draft";

  if (mode === "remove") {
    const { count } = await prisma.blogPost.deleteMany({ where: { slug: { in: POSTS.map((p) => p.slug) } } });
    console.log(`Removed ${count} sample posts.`);
    return;
  }

  for (const c of CATEGORIES) {
    await prisma.blogCategory.upsert({ where: { slug: c.slug }, update: {}, create: c });
  }
  const tagNames = [...new Set(POSTS.flatMap((p) => p.tags))];
  for (const name of tagNames) {
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
    await prisma.blogTag.upsert({ where: { slug }, update: {}, create: { slug, name } });
  }

  const status = mode === "publish" ? "PUBLISHED" : "DRAFT";
  for (const p of POSTS) {
    const data = {
      title: p.title,
      excerpt: p.excerpt,
      body: p.body,
      coverImage: p.cover,
      status: status as "PUBLISHED" | "DRAFT",
      publishedAt: new Date(Date.now() - p.daysAgo * 86_400_000),
      authorName: AUTHOR,
      categories: { set: [{ slug: p.category }] },
      tags: { set: p.tags.map((t) => ({ slug: t.toLowerCase().replace(/[^a-z0-9]+/g, "-") })) },
    };
    await prisma.blogPost.upsert({
      where: { slug: p.slug },
      update: data,
      create: {
        ...data,
        slug: p.slug,
        categories: { connect: [{ slug: p.category }] },
        tags: { connect: data.tags.set },
      },
    });
  }
  console.log(`${POSTS.length} sample posts saved as ${status.toLowerCase()}.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
