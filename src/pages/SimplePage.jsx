export default function SimplePage({ title, description }) {
  return (
    <main className="container empty-state">
      <h2>{title}</h2>
      <p>{description}</p>
    </main>
  );
}
