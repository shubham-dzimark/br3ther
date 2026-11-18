import "server-only";
import { cookies, headers } from "next/headers";

import { LOCALES, DEFAULT_LOCALE, LOCALE_COOKIE, type Locale } from "@/lib/locales";

export { LOCALES, DEFAULT_LOCALE, LOCALE_COOKIE };
export type { Locale };

/** Every user-facing string in the storefront chrome. */
const DICT = {
  // Header / nav
  "nav.shop": ["Shop", "Boutique"],
  "nav.shopAll": ["Shop all products", "Voir tous les produits"],
  "nav.exploreCategories": ["Explore all categories", "Explorer les catégories"],
  "header.callUs": ["Call us", "Appelez-nous"],
  "header.trackOrder": ["Track order", "Suivre une commande"],
  "header.searchPlaceholder": ["Search for products…", "Rechercher des produits…"],
  "header.searchButton": ["Search", "Rechercher"],
  "nav.wishlist": ["Wishlist", "Favoris"],
  "footer.about": ["About", "À propos"],
  "footer.myAccount": ["My account", "Mon compte"],
  "footer.categories": ["Categories", "Catégories"],
  "footer.contact": ["Contact", "Contact"],
  "footer.newsletterHeading": ["Subscribe to our newsletter", "Abonnez-vous à notre infolettre"],
  "home.latestBlog": ["Latest blog", "Derniers articles"],
  "home.viewAll": ["View all", "Tout voir"],
  "home.readMore": ["Read more", "Lire la suite"],
  // {n} is the number of products in a category, in the Shop mega menu.
  "nav.productCount": ["{n} products", "{n} produits"],
  "nav.productCountOne": ["{n} product", "{n} produit"],
  "nav.onSale": ["On sale", "En solde"],
  "nav.search": ["Search products", "Rechercher des produits"],
  "nav.signIn": ["Sign in", "Connexion"],
  "nav.account": ["Account", "Compte"],
  "nav.home": ["Home", "Accueil"],
  "nav.shopNow": ["Shop Now", "Boutique"],
  "nav.myAccount": ["My Account", "Mon compte"],
  "nav.all": ["All", "Tout"],
  "nav.menu": ["Menu", "Menu"],
  "nav.close": ["Close", "Fermer"],

  // Cart
  "cart.title": ["Your cart", "Votre panier"],
  "cart.open": ["Open cart", "Ouvrir le panier"],
  "cart.empty": ["Your cart is empty", "Votre panier est vide"],
  "cart.emptyBody": [
    "Nothing here yet. Have a look around the shop.",
    "Rien ici pour l'instant. Parcourez la boutique.",
  ],
  "cart.browse": ["Browse products", "Voir les produits"],
  "cart.subtotal": ["Subtotal", "Sous-total"],
  "cart.shoppersBought": ["{n}+ shoppers have bought this", "{n}+ clients l'ont acheté"],
  "cart.tierTag": ["Bundle & Save −{pct}%", "Achetez plus −{pct} %"],
  "cart.upsellTag": ["Offer −{pct}%", "Offre −{pct} %"],
  "cart.tierSavings": ["Bundle & Save", "Achetez plus, économisez"],
  "tiers.title": ["Bundle & Save", "Achetez plus, économisez"],
  "tiers.buy": ["Buy {n}", "Achetez {n}"],
  "tiers.save": ["Save {pct}%", "Économisez {pct} %"],
  "tiers.youSave": ["You save {amount}", "Vous économisez {amount}"],
  "tiers.each": ["{price} each", "{price} chacun"],
  "promo.useCode": ["Use code {code} for {offer}", "Utilisez le code {code} pour {offer}"],
  "promo.percentOff": ["{n}% off everything", "{n} % de rabais sur tout"],
  "promo.amountOff": ["{amount} off your order", "{amount} de rabais sur votre commande"],
  "promo.minSpend": ["on orders over {amount}", "sur les commandes de plus de {amount}"],
  "promo.apply": ["Apply", "Appliquer"],
  "cart.shipping": ["Shipping", "Livraison"],
  "cart.free": ["Free", "Gratuite"],
  "cart.tax": ["Tax", "Taxe"],
  "cart.discount": ["Discount", "Remise"],
  "cart.total": ["Total", "Total"],
  "cart.estimatedTotal": ["Estimated total", "Total estimé"],
  "cart.checkout": ["Proceed to checkout", "Passer à la caisse"],
  "cart.continue": ["Continue shopping", "Continuer mes achats"],
  "cart.view": ["View cart", "Voir le panier"],
  "cart.remove": ["Remove", "Retirer"],
  "cart.update": ["Update", "Mettre à jour"],
  "cart.quantity": ["Quantity", "Quantité"],
  "cart.each": ["each", "l'unité"],
  "cart.item": ["item", "article"],
  "cart.items": ["items", "articles"],
  "cart.product": ["Product", "Produit"],
  "cart.summary": ["Order summary", "Récapitulatif"],
  "cart.discountCode": ["Discount code", "Code de réduction"],
  "cart.apply": ["Apply", "Appliquer"],
  "cart.enterCode": ["Enter a code", "Saisir un code"],
  "cart.shippingLater": [
    "Shipping and tax are worked out at checkout.",
    "Livraison et taxes calculées à la caisse.",
  ],

  // Product
  "product.addToCart": ["Add to cart", "Ajouter au panier"],
  "product.adding": ["Adding…", "Ajout…"],
  "product.outOfStock": ["Out of stock", "Rupture de stock"],
  "product.inStock": ["In stock", "En stock"],
  "product.soldOut": ["Sold out", "Épuisé"],
  "product.onlyLeft": ["Only {n} left", "Plus que {n}"],
  "product.size": ["Size", "Taille"],
  "product.description": ["Description", "Description"],
  "product.reviews": ["Reviews", "Avis"],
  "product.noReviews": ["No reviews", "Aucun avis"],
  "product.writeReview": ["Write a review", "Rédiger un avis"],
  "product.related": ["You may also like", "Vous aimerez aussi"],
  "product.verified": ["Verified purchase", "Achat vérifié"],
  "product.save": ["Save {n}%", "Économisez {n} %"],

  // Shop
  "shop.title": ["Shop", "Boutique"],
  "shop.category": ["Category", "Catégorie"],
  "shop.allCategories": ["All categories", "Toutes les catégories"],
  "shop.rating": ["Customer rating", "Note des clients"],
  "shop.andUp": ["& up", "et plus"],
  "shop.offers": ["Offers", "Offres"],
  "shop.onSaleOnly": ["On sale only", "En solde uniquement"],
  "shop.activeFilters": ["Active filters", "Filtres actifs"],
  "shop.clearAll": ["Clear all", "Tout effacer"],
  "shop.sortBy": ["Sort by", "Trier par"],
  "shop.featured": ["Featured", "En vedette"],
  "shop.newest": ["Newest", "Nouveautés"],
  "shop.priceAsc": ["Price: low to high", "Prix : croissant"],
  "shop.priceDesc": ["Price: high to low", "Prix : décroissant"],
  "shop.bestRated": ["Best rated", "Mieux notés"],
  "shop.noMatch": [
    "No products match those filters.",
    "Aucun produit ne correspond à ces filtres.",
  ],
  "shop.products": ["products", "produits"],
  "shop.product": ["product", "produit"],

  // Checkout
  "checkout.title": ["Checkout", "Commande"],
  "checkout.contact": ["Contact", "Coordonnées"],
  "checkout.email": ["Email", "Courriel"],
  "checkout.phone": ["Phone", "Téléphone"],
  "checkout.shipping": ["Shipping address", "Adresse de livraison"],
  "checkout.fullName": ["Full name", "Nom complet"],
  "checkout.address": ["Address", "Adresse"],
  "checkout.apartment": ["Apartment, suite, etc.", "Appartement, bureau, etc."],
  "checkout.city": ["City", "Ville"],
  "checkout.region": ["Province / state", "Province / État"],
  "checkout.postal": ["Postal code", "Code postal"],
  "checkout.country": ["Country", "Pays"],
  "checkout.notes": ["Order notes", "Notes de commande"],
  "checkout.referral": ["Referral code", "Code de parrainage"],
  "checkout.placeOrder": ["Place order", "Passer la commande"],
  "checkout.yourOrder": ["Your order", "Votre commande"],
  "checkout.payment": ["Payment", "Paiement"],

  // Account
  "account.title": ["My account", "Mon compte"],
  "account.orders": ["Orders", "Commandes"],
  "account.orderHistory": ["Order history", "Historique des commandes"],
  "account.referFriend": ["Refer a friend", "Parrainer un ami"],
  "account.memberPoints": ["Member points", "Points membre"],
  "account.points": ["Points", "Points"],
  "account.signOut": ["Sign out", "Déconnexion"],
  "account.signIn": ["Sign in", "Connexion"],
  "account.register": ["Create an account", "Créer un compte"],
  "account.totalSpent": ["Total spent", "Total dépensé"],

  // Footer
  "footer.shop": ["Shop", "Boutique"],
  "footer.allProducts": ["All products", "Tous les produits"],
  "footer.help": ["Help", "Aide"],
  "footer.rights": ["All rights reserved.", "Tous droits réservés."],
  "footer.ourStore": ["Our store", "Notre boutique"],
  "footer.contactUs": ["Contact us", "Nous joindre"],
  "footer.liveChat": ["Live chat", "Clavardage"],
  "footer.newsletter": ["Newsletter", "Infolettre"],
  "footer.supportCentre": ["Support centre:", "Service client\u00a0:"],
  "footer.legalIntro": ["By subscribing you agree to the", "En vous abonnant, vous acceptez"],
  "footer.and": ["and", "et"],
  "footer.terms": ["Terms of Service", "Conditions d\u2019utilisation"],
  "footer.privacy": ["Privacy Policy", "Politique de confidentialit\u00e9"],
  "footer.weAccept": [
    "We accept Interac e-Transfer.",
    "Nous acceptons le Virement Interac.",
  ],
  "footer.shipsWith": ["We ship with Canada Post.", "Nous expédions avec Postes Canada."],
  "footer.language": ["Language", "Langue"],
  "footer.subscribe": ["Subscribe newsletter", "Abonnez-vous"],
  "footer.subscribeSub": [
    "Stay updated with the latest arrivals",
    "Restez informe des nouveautes",
  ],
  "footer.emailPlaceholder": ["Enter your email", "Saisissez votre e-mail"],
  "footer.submit": ["Claim gift", "Obtenir mon cadeau"],
  "footer.customerCare": ["Customer care", "Service client"],
  "footer.helpSupport": ["Help & support", "Aide et assistance"],
  "footer.reviews": ["Customer reviews", "Avis clients"],

  // Lab results page
  "lab.title": ["Lab Results", "Résultats de laboratoire"],
  "lab.viewResults": ["View Lab Results", "Voir les résultats de laboratoire"],

  // Track your order
  "track.title": ["Track your order", "Suivre votre commande"],
  "track.intro": [
    "Enter your order number and the email you ordered with to see where your order is.",
    "Saisissez votre numéro de commande et l'e-mail utilisé pour voir où en est votre commande.",
  ],
  "track.orderNumber": ["Order number", "Numéro de commande"],
  "track.orderNumberHint": ["e.g. #0012 - it's in your order confirmation email", "p. ex. #0012 - dans votre e-mail de confirmation"],
  "track.email": ["Email address", "Adresse e-mail"],
  "track.submit": ["Track order", "Suivre la commande"],
  "track.searching": ["Looking up…", "Recherche…"],
  "track.notFound": [
    "We couldn't find an order with that number and email. Please check both and try again.",
    "Aucune commande ne correspond à ce numéro et à cet e-mail. Vérifiez-les et réessayez.",
  ],
  "track.tooMany": [
    "Too many attempts. Please wait a few minutes and try again.",
    "Trop de tentatives. Patientez quelques minutes puis réessayez.",
  ],
  "track.placed": ["Order placed", "Commande passée"],
  "track.paid": ["Payment received", "Paiement reçu"],
  "track.processing": ["Processing", "En préparation"],
  "track.shipped": ["Shipped", "Expédiée"],
  "track.delivered": ["Delivered", "Livrée"],
  "track.awaitingPayment": [
    "We're waiting for your payment. The payment instructions are in your order confirmation email.",
    "Nous attendons votre paiement. Les instructions sont dans votre e-mail de confirmation.",
  ],
  "track.cancelled": ["This order was cancelled.", "Cette commande a été annulée."],
  "track.refunded": ["This order was refunded.", "Cette commande a été remboursée."],
  "track.trackParcel": ["Track parcel", "Suivre le colis"],
  "track.trackingNumber": ["Tracking number", "Numéro de suivi"],
  "track.noTrackingYet": [
    "Tracking details appear here once your order ships.",
    "Le numéro de suivi apparaîtra ici dès l'expédition.",
  ],
  "track.items": ["Items", "Articles"],
  "track.total": ["Total", "Total"],
  "track.shipTo": ["Shipping to", "Livraison à"],
  "track.order": ["Order", "Commande"],
} as const;

export type MessageKey = keyof typeof DICT;

/** Reads the chosen locale, falling back to Accept-Language then English. */
export async function getLocale(): Promise<Locale> {
  const store = await cookies();
  const chosen = store.get(LOCALE_COOKIE)?.value;
  if (chosen && (LOCALES as readonly string[]).includes(chosen)) {
    return chosen as Locale;
  }

  // No explicit choice yet - honour the browser's preference once.
  const accept = (await headers()).get("accept-language") ?? "";
  const preferred = accept
    .split(",")
    .map((part) => part.split(";")[0]?.trim().toLowerCase() ?? "")
    .find((tag) => tag.startsWith("fr") || tag.startsWith("en"));

  return preferred?.startsWith("fr") ? "fr" : DEFAULT_LOCALE;
}

export type Translator = ((
  key: MessageKey,
  vars?: Record<string, string | number>,
) => string) & { locale: Locale };

/** Build a translator for a locale. Missing keys fall back to English. */
export function makeTranslator(locale: Locale): Translator {
  const index = LOCALES.indexOf(locale);
  const t = ((key: MessageKey, vars?: Record<string, string | number>) => {
    const entry = DICT[key];
    let out: string = entry?.[index] ?? entry?.[0] ?? key;
    if (vars) {
      for (const [k, v] of Object.entries(vars)) {
        out = out.replace(new RegExp(`\\{${k}\\}`, "g"), String(v));
      }
    }
    return out;
  }) as Translator;
  t.locale = locale;
  return t;
}

export async function getTranslator(): Promise<Translator> {
  return makeTranslator(await getLocale());
}
