import { Link, useInRouterContext } from 'react-router-dom';

export default function PageBackLink({ children, label, onClick, to }) {
  const inRouter = useInRouterContext();
  const content = (
    <>
      <span aria-hidden="true">←</span>
      <span>{children ?? label}</span>
    </>
  );

  if (to && inRouter) {
    return <Link className="page-back-link" to={to}>{content}</Link>;
  }

  if (to) {
    return <a className="page-back-link" href={to}>{content}</a>;
  }

  return (
    <button className="page-back-link" type="button" onClick={onClick}>
      {content}
    </button>
  );
}
