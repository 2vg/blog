import React from 'react';

import { Link } from 'gatsby';
import PropTypes from 'prop-types';

import './index.scss';

const LatestPost = ({ posts }) => {
  const excludesSlug = ['/about/', '/guestbook'];
  const newPosts = posts.filter(({ node }) => (
    !excludesSlug.includes(node.frontmatter.url || node.frontmatter.slug || node.fields.slug)
  ));

  return (
    <div className="latest-post">
      <p>最新の投稿</p>
      {newPosts.map(({ node }) => (
        <Link
          to={node.frontmatter.url || node.frontmatter.slug || node.fields.slug}
          key={node.frontmatter.url || node.frontmatter.slug || node.fields.slug}
          href={node.frontmatter.url || node.frontmatter.slug || node.fields.slug}
        >
          {node.frontmatter.title}
        </Link>
      ))}
    </div>
  );
};

LatestPost.propTypes = {
  posts: PropTypes.arrayOf(PropTypes.object).isRequired,
};

export default LatestPost;
