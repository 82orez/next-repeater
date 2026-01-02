import Link from "next/link";

export default function Home() {
  return (
    <div className="flex h-screen items-center justify-center">
      <Link href={"player"}>Go to Repeater!</Link>
    </div>
  );
}
