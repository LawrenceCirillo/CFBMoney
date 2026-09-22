import type { Metadata } from "next";
import { Archivo } from "next/font/google";
import "./globals.css";
import Navbar from "@/components/Navbar";
import ScoreTicker from "@/components/ScoreTicker";
import ThemeProvider from "@/components/ThemeProvider";
import { data } from "@/lib/data";
import { fmtPollDate } from "@/lib/format";

const archivo = Archivo({ subsets: ["latin"], display: "swap" });

export const metadata: Metadata = {
  title: "CFB Money — What does it cost to win college football?",
  description:
    "Estimated 2026 roster budgets for every Power 4 program, who gets the most out of their spending, head-to-head comparisons, and a build-your-own-roster game.",
};

// Runs before paint so the saved theme applies without a flash.
const themeScript = `(function(){try{var t=localStorage.getItem("cfb-money-theme");if(t==="dark"){document.documentElement.classList.add("dark");}}catch(e){}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className={archivo.className}>
        <a href="#content" className="skip-link">
          Skip to content
        </a>
        <ThemeProvider>
          <div className="sticky top-0 z-50">
            <ScoreTicker />
            <Navbar />
          </div>
          <main id="content" className="mx-auto max-w-6xl px-4 sm:px-6">
            {children}
          </main>
          <footer className="mt-24 border-t border-line">
            <div className="mx-auto max-w-6xl px-4 sm:px-6 py-8 text-sm text-fog">
              Budget estimates via{" "}
              <a
                className="underline underline-offset-2 hover:text-paper"
                href="https://www.nytimes.com/athletic/interactive/college-football-nil-spending-budgets/"
              >
                The Athletic’s NIL budget report
              </a>{" "}
              (Sept 2026), shown as ranges. AP ranks through Week {data.poll.week} of 2026
              (poll of {fmtPollDate(data.poll.as_of)}). School marks identify programs and belong to
              those schools. A prototype — not affiliated with ESPN, the NCAA,
              any school, or any conference.
            </div>
          </footer>
        </ThemeProvider>
      </body>
    </html>
  );
}
