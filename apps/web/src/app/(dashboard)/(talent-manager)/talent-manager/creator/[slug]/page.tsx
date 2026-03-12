// TODO: needs generateMetadata for SEO
export default async function TalentManagerCreatorPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  // TODO: implement individual creator view for talent manager
  return (
    <div>
      <h1 className="text-3xl font-bold">Creator: {slug}</h1>
    </div>
  );
}
