import React from 'react';
import PropTypes from 'prop-types';
import { Link } from 'gatsby';

import Dropdown from './Dropdown';

//import './index.scss';

const NavItem = ({ url, name, list }) => {
  if (list.length === 0) {
    return (
      <Link
        className="nav-btn btn btn-link"
        href={url}
        to={url}
      >
        {name}
      </Link>
    );
  }

  return <Dropdown title={name} list={list} />;
};

NavItem.propTypes = {
  url: PropTypes.string.isRequired,
  name: PropTypes.string.isRequired,
  list: PropTypes.arrayOf(
    PropTypes.shape({
      title: PropTypes.string,
      href: PropTypes.string,
    }),
  ),
};

NavItem.defaultProps = {
  list: [],
};

export default NavItem;