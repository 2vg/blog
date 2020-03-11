import React from "react"
import styled from "styled-components"
import Layout from "../components/layout"
import SEO from "../components/seo"
import Search from "../components/search"

const Wrapper = styled.div`
  width: var(--width);
  text-align: center;
  h1 {
    font-size: 1.4rem;
    font-weight: 600;
    padding: 10px 0;
  }
  p {
    font-size: 0.9rem;
  }
`

const SearchPage = (props, location) => (
  <Layout location={location} title="Search">
    <SEO title="Search" noindex />
    <Wrapper>
      <Search className={`${props.className} ${"fixed"}`} />
    </Wrapper>
  </Layout>
)

export default SearchPage
