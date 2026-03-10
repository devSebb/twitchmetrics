// TODO: needs generateMetadata for SEO
export default async function TalentManagerCreatorPage({
  params,
}: {
  params: Promise<{ creatorSlug: string }>
}) {
  const { creatorSlug } = await params
  // TODO: implement individual creator view for talent manager
  return (
    <div>
      <h1 className="text-3xl font-bold">Creator: {creatorSlug}</h1>
    </div>
  )
}
