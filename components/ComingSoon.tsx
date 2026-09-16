import Link from "next/link";

type Props = {
  title: string;
  description: string;
};

export function ComingSoon({ title, description }: Props) {
  return (
    <div className="mx-auto max-w-2xl px-4 py-20 text-center sm:px-6">
      <h1 className="font-display text-4xl font-bold uppercase tracking-tight text-obsidian sm:text-5xl">
        {title}
      </h1>
      <p className="mt-4 text-slate">{description}</p>
      <p className="mt-8 inline-block border border-stone px-4 py-2 text-sm font-medium uppercase tracking-wider text-slate">
        Coming soon
      </p>
      <p className="mt-8">
        <Link href="/" className="text-sm font-medium text-obsidian underline">
          Back to homepage
        </Link>
      </p>
    </div>
  );
}
