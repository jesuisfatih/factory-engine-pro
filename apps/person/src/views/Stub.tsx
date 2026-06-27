interface Props { title: string; description: string; }

export function StubView({ title, description }: Props) {
  return (
    <div className="stub">
      <h3>{title}</h3>
      <p>{description}</p>
    </div>
  );
}
