import fs from "node:fs";
import path from "node:path";

function loadEnvLocal() {
  const envPath = path.resolve(process.cwd(), ".env.local");
  if (!fs.existsSync(envPath)) return {};
  const content = fs.readFileSync(envPath, "utf-8");
  const env = {};
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx !== -1) {
      const key = trimmed.slice(0, eqIdx).trim();
      const val = trimmed.slice(eqIdx + 1).trim();
      env[key] = val;
    }
  }
  return env;
}

const env = { ...process.env, ...loadEnvLocal() };
const ACCOUNT_ID = env.CLOUDFLARE_ACCOUNT_ID;
const API_TOKEN = env.CLOUDFLARE_API_TOKEN;
const SITE_TAG = env.CLOUDFLARE_SITE_TAG;

if (!ACCOUNT_ID || !API_TOKEN) {
  console.error("Error: CLOUDFLARE_ACCOUNT_ID atau CLOUDFLARE_API_TOKEN belum diset.");
  process.exit(1);
}

const args = process.argv.slice(2);
const daysArgIdx = args.indexOf("--days");
const days = daysArgIdx !== -1 && args[daysArgIdx + 1] ? Number(args[daysArgIdx + 1]) : 7;

const sinceDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

const query = `
query GetRumStats($accountTag: string!, $since: Time!) {
  viewer {
    accounts(filter: { accountTag: $accountTag }) {
      totals: rumPageloadEventsAdaptiveGroups(
        limit: 1
        filter: { datetime_geq: $since }
      ) {
        count
        sum {
          visits
        }
      }
      byDate: rumPageloadEventsAdaptiveGroups(
        limit: 14
        filter: { datetime_geq: $since }
        orderBy: [date_DESC]
      ) {
        count
        sum {
          visits
        }
        dimensions {
          date
        }
      }
      byPath: rumPageloadEventsAdaptiveGroups(
        limit: 10
        filter: { datetime_geq: $since }
        orderBy: [count_DESC]
      ) {
        count
        sum {
          visits
        }
        dimensions {
          requestPath
        }
      }
      byCountry: rumPageloadEventsAdaptiveGroups(
        limit: 10
        filter: { datetime_geq: $since }
        orderBy: [count_DESC]
      ) {
        count
        sum {
          visits
        }
        dimensions {
          countryName
        }
      }
      byDevice: rumPageloadEventsAdaptiveGroups(
        limit: 5
        filter: { datetime_geq: $since }
        orderBy: [count_DESC]
      ) {
        count
        sum {
          visits
        }
        dimensions {
          deviceType
        }
      }
      byBrowser: rumPageloadEventsAdaptiveGroups(
        limit: 5
        filter: { datetime_geq: $since }
        orderBy: [count_DESC]
      ) {
        count
        sum {
          visits
        }
        dimensions {
          userAgentBrowser
        }
      }
      byReferer: rumPageloadEventsAdaptiveGroups(
        limit: 5
        filter: { datetime_geq: $since }
        orderBy: [count_DESC]
      ) {
        count
        sum {
          visits
        }
        dimensions {
          refererHost
        }
      }
    }
  }
}
`;

async function main() {
  const res = await fetch("https://api.cloudflare.com/client/v4/graphql", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${API_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      query,
      variables: {
        accountTag: ACCOUNT_ID,
        since: sinceDate,
      },
    }),
  });

  if (!res.ok) {
    console.error(`HTTP error ${res.status}: ${res.statusText}`);
    process.exit(1);
  }

  const json = await res.json();
  if (json.errors && json.errors.length > 0) {
    console.error("GraphQL errors:", JSON.stringify(json.errors, null, 2));
    process.exit(1);
  }

  const account = json.data?.viewer?.accounts?.[0];
  if (!account) {
    console.log("Tidak ada data akun yang ditemukan.");
    return;
  }

  const totalPageviews = account.totals?.[0]?.count ?? 0;
  const totalVisits = account.totals?.[0]?.sum?.visits ?? 0;

  console.log(`### Laporan Traffic Pe-Larian (${days} Hari Terakhir)`);
  console.log(`- **Total Pengunjung Unik (Visits):** ${totalVisits.toLocaleString("id-ID")}`);
  console.log(`- **Total Pageviews:** ${totalPageviews.toLocaleString("id-ID")}\n`);

  if (totalPageviews === 0) {
    console.log("> Belum ada kunjungan tercatat dalam periode ini.");
    return;
  }

  if (account.byDate && account.byDate.length > 0) {
    console.log("#### Kunjungan Harian");
    console.log("| Tanggal | Pengunjung Unik | Pageviews |");
    console.log("| :--- | :---: | :---: |");
    for (const d of account.byDate) {
      console.log(`| ${d.dimensions.date} | ${d.sum?.visits ?? 0} | ${d.count} |`);
    }
    console.log("");
  }

  if (account.byPath && account.byPath.length > 0) {
    console.log("#### Halaman Terpopuler");
    console.log("| Path Halaman | Pageviews | Pengunjung |");
    console.log("| :--- | :---: | :---: |");
    for (const p of account.byPath) {
      console.log(`| \`${p.dimensions.requestPath}\` | ${p.count} | ${p.sum?.visits ?? 0} |`);
    }
    console.log("");
  }

  if (account.byDevice && account.byDevice.length > 0) {
    console.log("#### Perangkat");
    console.log("| Tipe Perangkat | Pageviews |");
    console.log("| :--- | :---: |");
    for (const dev of account.byDevice) {
      console.log(`| ${dev.dimensions.deviceType || "Unknown"} | ${dev.count} |`);
    }
    console.log("");
  }

  if (account.byCountry && account.byCountry.length > 0) {
    console.log("#### Negara Asal");
    console.log("| Negara | Pageviews |");
    console.log("| :--- | :---: |");
    for (const c of account.byCountry) {
      console.log(`| ${c.dimensions.countryName || "Unknown"} | ${c.count} |`);
    }
    console.log("");
  }

  if (account.byReferer && account.byReferer.length > 0) {
    console.log("#### Sumber Rujukan (Referrer)");
    console.log("| Referrer Host | Pageviews |");
    console.log("| :--- | :---: |");
    for (const r of account.byReferer) {
      console.log(`| ${r.dimensions.refererHost || "Langsung / Direct"} | ${r.count} |`);
    }
    console.log("");
  }
}

main().catch((err) => {
  console.error("Gagal menarik data:", err);
  process.exit(1);
});
