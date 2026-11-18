import "server-only";
import { prisma } from "@/lib/prisma";

export type PublicTrigger = {
  id: string;
  message: string;
  pathPrefix: string;
  delaySeconds: number;
  minCartCents: number;
  onExitIntent: boolean;
};

/**
 * The active triggers, in the order they should be tested.
 *
 * Only the fields the browser needs: the admin's own name for a rule is not
 * something a customer should be able to read out of the page source.
 */
export async function getActiveTriggers(): Promise<PublicTrigger[]> {
  return prisma.chatTrigger.findMany({
    where: { isActive: true },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    take: 20,
    select: {
      id: true,
      message: true,
      pathPrefix: true,
      delaySeconds: true,
      minCartCents: true,
      onExitIntent: true,
    },
  });
}
