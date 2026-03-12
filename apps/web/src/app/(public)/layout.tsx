import { Header, Footer } from "@/components/layout";

export default function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <Header />
      <main className="min-h-screen bg-[#2B2D31]">{children}</main>
      <Footer />
    </>
  );
}
