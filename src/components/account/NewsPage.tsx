"use client";

import { useEffect, useState } from "react";
import { Newspaper } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatRelative } from "@/lib/format";
import { BACKEND_ORIGIN } from "@/lib/backend";
import { Empty } from "@/components/ui/primitives";
import { Spinner } from "@/components/ui/Spinner";

interface Article {
  id: string;
  headline: string;
  summary: string;
  source: string;
  url: string;
  image: string | null;
  publishedAt: number | null;
}

const CATEGORIES = [
  { value: "crypto", label: "Crypto" },
  { value: "general", label: "Markets" },
  { value: "forex", label: "Forex" },
] as const;

/** Headlines from Finnhub, through the backend so the key stays server-side. */
export function NewsPage() {
  const [category, setCategory] = useState<(typeof CATEGORIES)[number]["value"]>("crypto");
  const [articles, setArticles] = useState<Article[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let live = true;
    setArticles(null);
    setError(false);
    fetch(`${BACKEND_ORIGIN}/api/news?category=${category}`)
      .then(async (response) => {
        const body = (await response.json().catch(() => ({}))) as { articles?: Article[] };
        if (!live) return;
        if (!response.ok) throw new Error();
        setArticles(body.articles ?? []);
      })
      .catch(() => {
        if (live) {
          setError(true);
          setArticles([]);
        }
      });
    return () => {
      live = false;
    };
  }, [category]);

  return (
    <div className="mx-auto max-w-[760px]">
      <div className="mb-3 flex gap-1">
        {CATEGORIES.map((c) => (
          <button
            key={c.value}
            onClick={() => setCategory(c.value)}
            className={cn(
              "h-8 border px-3 text-[12.5px] font-medium transition-colors",
              category === c.value
                ? "border-ink bg-ink text-surface-1"
                : "border-line-strong text-ink-secondary hover:text-ink",
            )}
          >
            {c.label}
          </button>
        ))}
      </div>

      <div className="border border-line bg-surface-1 lg:max-h-[calc(100dvh-210px)] lg:overflow-y-auto">
        {articles === null ? (
          <div className="grid place-items-center py-16">
            <Spinner size={30} label="Loading news" />
          </div>
        ) : articles.length === 0 ? (
          <Empty
            icon={<Newspaper className="h-5 w-5" />}
            title={error ? "News is unavailable right now" : "No headlines yet"}
          />
        ) : (
          <ul className="divide-y divide-line">
            {articles.map((article) => (
              <li key={article.id}>
                <a
                  href={article.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex gap-3 p-4 transition-colors hover:bg-surface-2"
                >
                  <div className="min-w-0 flex-1">
                    <div className="line-clamp-2 text-[14px] font-medium leading-snug text-ink">
                      {article.headline}
                    </div>
                    <div className="mt-1 text-[11.5px] text-ink-faint">
                      {article.source}
                      {article.publishedAt ? ` · ${formatRelative(article.publishedAt)}` : ""}
                    </div>
                  </div>
                  {article.image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={article.image}
                      alt=""
                      loading="lazy"
                      referrerPolicy="no-referrer"
                      className="h-16 w-24 shrink-0 object-cover"
                    />
                  ) : null}
                </a>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
