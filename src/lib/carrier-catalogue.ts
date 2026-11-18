/**
 * Built-in carrier catalogue: the list the "Add carriers" picker offers.
 *
 * This is only a starting point - once added, a carrier lives in the database
 * and its name, tracking URL and logo can all be edited, so a wrong or changed
 * URL here is fixable in the admin without a deploy. `{n}` is replaced with the
 * tracking number.
 */
export type CatalogueCarrier = {
  key: string;
  name: string;
  region: string;
  monogram: string;
  colour: string;
  track: string;
};

export const CARRIER_CATALOGUE: CatalogueCarrier[] = [
  // ---- Canada ----
  { key: "canada-post", name: "Canada Post", region: "Canada", monogram: "CP", colour: "#DA291C", track: "https://www.canadapost-postescanada.ca/track-reperage/en#/search?searchFor={n}" },
  { key: "purolator", name: "Purolator", region: "Canada", monogram: "PU", colour: "#652D86", track: "https://www.purolator.com/en/shipping/tracker?pin={n}" },
  { key: "canpar", name: "Canpar Express", region: "Canada", monogram: "CX", colour: "#0033A0", track: "https://www.canpar.com/en/track/TrackingAction.do?reference={n}" },
  { key: "ics-courier", name: "ICS Courier", region: "Canada", monogram: "IC", colour: "#00539B", track: "https://www.icscourier.ca/tools/track-a-shipment/?awb={n}" },
  { key: "loomis", name: "Loomis Express", region: "Canada", monogram: "LO", colour: "#003C71", track: "https://www.loomisexpress.com/tracking?pin={n}" },
  { key: "intelcom", name: "Intelcom", region: "Canada", monogram: "IN", colour: "#E4002B", track: "https://intelcom.ca/en/track-my-package/?tracking_number={n}" },
  { key: "uniuni", name: "UniUni", region: "Canada", monogram: "UU", colour: "#F5A623", track: "https://www.uniuni.com/tracking/?no={n}" },
  { key: "gls-canada", name: "GLS Canada", region: "Canada", monogram: "GL", colour: "#0033A0", track: "https://gls-group.com/CA/en/parcel-tracking?match={n}" },

  // ---- Global ----
  { key: "ups", name: "UPS", region: "Global", monogram: "UP", colour: "#351C15", track: "https://www.ups.com/track?loc=en_CA&tracknum={n}" },
  { key: "fedex", name: "FedEx", region: "Global", monogram: "FX", colour: "#4D148C", track: "https://www.fedex.com/fedextrack/?trknbr={n}" },
  { key: "dhl-express", name: "DHL Express", region: "Global", monogram: "DH", colour: "#FFCC00", track: "https://www.dhl.com/global-en/home/tracking/tracking-express.html?tracking-id={n}" },
  { key: "dhl-ecommerce", name: "DHL eCommerce", region: "Global", monogram: "DE", colour: "#FFCC00", track: "https://www.dhl.com/global-en/home/tracking/tracking-ecommerce.html?tracking-id={n}" },
  { key: "tnt", name: "TNT", region: "Global", monogram: "TN", colour: "#FF6600", track: "https://www.tnt.com/express/en_gb/site/shipping-tools/tracking.html?searchType=con&cons={n}" },
  { key: "aramex", name: "Aramex", region: "Global", monogram: "AR", colour: "#E4002B", track: "https://www.aramex.com/us/en/track/results?ShipmentNumber={n}" },
  { key: "dpd", name: "DPD", region: "Global", monogram: "DP", colour: "#DC0032", track: "https://www.dpd.com/tracking?parcelNumber={n}" },
  { key: "gls", name: "GLS", region: "Global", monogram: "GS", colour: "#0033A0", track: "https://gls-group.com/GROUP/en/parcel-tracking?match={n}" },

  // ---- United States ----
  { key: "usps", name: "USPS", region: "United States", monogram: "US", colour: "#333366", track: "https://tools.usps.com/go/TrackConfirmAction?tLabels={n}" },
  { key: "ontrac", name: "OnTrac", region: "United States", monogram: "OT", colour: "#00447C", track: "https://www.ontrac.com/tracking/?number={n}" },

  // ---- Europe ----
  { key: "royal-mail", name: "Royal Mail", region: "United Kingdom", monogram: "RM", colour: "#DA291C", track: "https://www.royalmail.com/track-your-item#/tracking-results/{n}" },
  { key: "evri", name: "Evri", region: "United Kingdom", monogram: "EV", colour: "#00A0DF", track: "https://www.evri.com/track/parcel/{n}" },
  { key: "dhl-paket", name: "DHL Paket", region: "Germany", monogram: "DP", colour: "#FFCC00", track: "https://www.dhl.de/en/privatkunden/pakete-empfangen/verfolgen.html?piececode={n}" },
  { key: "postnl", name: "PostNL", region: "Netherlands", monogram: "PN", colour: "#FF6900", track: "https://postnl.post/detail?barcode={n}" },
  { key: "bpost", name: "Bpost", region: "Belgium", monogram: "BP", colour: "#E4002B", track: "https://track.bpost.cloud/btr/web/#/search?itemCode={n}" },
  { key: "colissimo", name: "Colissimo", region: "France", monogram: "CO", colour: "#003DA5", track: "https://www.laposte.fr/outils/suivre-vos-envois?code={n}" },
  { key: "correos", name: "Correos", region: "Spain", monogram: "CR", colour: "#FFCC00", track: "https://www.correos.es/es/es/herramientas/localizador/envios/detalle?tracking-number={n}" },
  { key: "poste-italiane", name: "Poste Italiane", region: "Italy", monogram: "PI", colour: "#003399", track: "https://www.poste.it/cerca/index.html#/risultati-spedizioni/{n}" },
  { key: "swiss-post", name: "Swiss Post", region: "Switzerland", monogram: "SP", colour: "#FFCC00", track: "https://service.post.ch/ekp-web/api/history?identifier={n}" },
  { key: "posti", name: "Posti", region: "Finland", monogram: "PO", colour: "#FF6600", track: "https://www.posti.fi/en/tracking#/lahetys/{n}" },
  { key: "postnord", name: "PostNord", region: "Sweden", monogram: "PN", colour: "#005AA0", track: "https://www.postnord.se/en/our-tools/track-and-trace?shipmentId={n}" },
  { key: "an-post", name: "An Post", region: "Ireland", monogram: "AP", colour: "#00843D", track: "https://www.anpost.com/Post-Parcels/Track?item={n}" },

  // ---- Asia-Pacific ----
  { key: "australia-post", name: "Australia Post", region: "Australia", monogram: "AU", colour: "#DC1928", track: "https://auspost.com.au/mypost/track/details/{n}" },
  { key: "startrack", name: "StarTrack", region: "Australia", monogram: "ST", colour: "#0072CE", track: "https://startrack.com.au/track-a-parcel?id={n}" },
  { key: "couriersplease", name: "CouriersPlease", region: "Australia", monogram: "CP", colour: "#F5C400", track: "https://www.couriersplease.com.au/tools-track/no/{n}" },
  { key: "nz-post", name: "NZ Post", region: "New Zealand", monogram: "NZ", colour: "#DA291C", track: "https://www.nzpost.co.nz/tools/tracking/item/{n}" },
  { key: "japan-post", name: "Japan Post", region: "Japan", monogram: "JP", colour: "#E4002B", track: "https://trackings.post.japanpost.jp/services/srv/search/direct?reqCodeNo1={n}&searchKind=S002&locale=en" },
  { key: "china-post", name: "China Post", region: "China", monogram: "CN", colour: "#008751", track: "https://track.chinapost.com.cn/result.html?number={n}" },
  { key: "sf-express", name: "SF Express", region: "China", monogram: "SF", colour: "#000000", track: "https://www.sf-express.com/us/en/dynamic_function/waybill/#search/bill-number/{n}" },
  { key: "yunexpress", name: "YunExpress", region: "China", monogram: "YE", colour: "#0072CE", track: "https://www.yuntrack.com/parcelTracking?id={n}" },
  { key: "singapore-post", name: "Singapore Post", region: "Singapore", monogram: "SG", colour: "#DA291C", track: "https://www.singpost.com/track-items?trackingNumber={n}" },
  { key: "india-post", name: "India Post", region: "India", monogram: "IP", colour: "#E4002B", track: "https://www.indiapost.gov.in/_layouts/15/DOP.Portal.Tracking/TrackConsignment.aspx?number={n}" },
  { key: "korea-post", name: "Korea Post", region: "South Korea", monogram: "KR", colour: "#E4002B", track: "https://service.epost.go.kr/trace.RetrieveDomRigiTraceList.comm?sid1={n}" },
  { key: "thailand-post", name: "Thailand Post", region: "Thailand", monogram: "TH", colour: "#E4002B", track: "https://track.thailandpost.co.th/?trackNumber={n}" },
  { key: "malaysia-post", name: "Pos Malaysia", region: "Malaysia", monogram: "MY", colour: "#E4002B", track: "https://www.pos.com.my/send/track?trackingNo={n}" },

  // ---- Latin America / Middle East ----
  { key: "correios", name: "Correios", region: "Brazil", monogram: "BR", colour: "#FFCC00", track: "https://rastreamento.correios.com.br/app/index.php?objeto={n}" },
  { key: "estafeta", name: "Estafeta", region: "Mexico", monogram: "ES", colour: "#E4002B", track: "https://www.estafeta.com/Herramientas/Rastreo?wayBill={n}" },
  { key: "emirates-post", name: "Emirates Post", region: "United Arab Emirates", monogram: "AE", colour: "#C8102E", track: "https://www.emiratespost.ae/track?trackingNumber={n}" },

  // ---- Fallback ----
  { key: "other", name: "Other carrier", region: "Global", monogram: "··", colour: "#64748B", track: "" },
];

/** Distinct regions, for the picker's country filter. */
export const CATALOGUE_REGIONS = Array.from(
  new Set(CARRIER_CATALOGUE.map((c) => c.region)),
).sort();
