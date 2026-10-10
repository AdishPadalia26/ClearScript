import { redirect } from "next/navigation";

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { demo } = await searchParams;
  redirect(demo ? `/queue?demo=${encodeURIComponent(demo)}` : "/queue");
}
