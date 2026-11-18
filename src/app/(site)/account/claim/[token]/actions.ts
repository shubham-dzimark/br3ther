"use server";

import { redirect } from "next/navigation";
import { consumeClaimToken } from "@/lib/customer-verify";
import { createCustomerSession } from "@/lib/customer-auth";
import { adoptCartOnLogin } from "@/lib/cart";
import { awardSignupBonus } from "@/lib/loyalty";
import { mergeWishlistIntoAccount } from "@/lib/wishlist";
import { requestFingerprint } from "@/lib/client-ip";

/**
 * Completes a guest-account claim.
 *
 * A Server Action rather than work done while the page renders. Two reasons,
 * both of which broke the previous version:
 *
 *  - cookies cannot be written during a server-component render, so creating
 *    the session threw after the token had already been spent, leaving the
 *    customer with a changed password, a burnt link and an error page;
 *  - mail scanners and link previewers issue a GET on every link they see, so
 *    a claim that completed on GET could be consumed before the customer ever
 *    clicked. Requiring this POST means a human pressed the button.
 */
export async function completeClaim(fd: FormData): Promise<void> {
  const token = String(fd.get("token") ?? "");
  const result = await consumeClaimToken(token);

  if (!result.ok) redirect("/account/claim/invalid");

  await awardSignupBonus(result.customerId);
  await mergeWishlistIntoAccount(result.customerId);

  const { ip, userAgent } = await requestFingerprint();
  await createCustomerSession(result.customerId, {
    ipAddress: ip ?? undefined,
    userAgent: userAgent ?? undefined,
  });
  await adoptCartOnLogin(result.customerId);

  redirect("/account?welcome=1");
}
