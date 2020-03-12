import styled from "styled-components"

export const Wrapper = styled.div`
  padding: 4px 10px 4px 12px;
  display: flex;
  transition: 0.3s ease;
  display: flex;
  align-items: center;
  svg {
    color: #fff;
    font-size: 0.88rem;
    margin-right: 10px;
    transition: 0.3s ease;
  }
  &.notHome,
  &.fixed {
    background: var(--background);
    input {
      color: var(--text);
      text-shadow: none;
      &::placeholder {
        color: rgba(55, 55, 55, 0.3);
      }
    }
  }
  @media screen and (max-width: 780px) {
    input {
      width: ${props => (props.focus ? "120px" : "70px")};
    }
  }
`
