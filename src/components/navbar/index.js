import React from 'react';

import NavItem from './NavItem';
import { Wrapper } from "./style"
import { config } from '../../../data';

const { navbarList = [] } = config;

const NavbarClass = [
  'navbar',
  'navbar-expand-md',
  'sticky-top',
  'custom-navbar',
];

const Navbar = (props) => (
  <Wrapper className={props.className}>
    <div class="bootstrap">
      <nav id="m-navbar" className={`${NavbarClass.join(' ')} navbar-night`}>
        <div className="container">
          <div
            className="collapse navbar-collapse flex-row-reverse"
            id="navbarSupportedContent"
          >
            <ul className="navbar-nav mr-2">
              {navbarList.map(item => (
                <NavItem
                  url={item.href}
                  name={item.title}
                  list={item.list}
                  key={item.href}
                />
              ))}
            </ul>
          </div>
        </div>
      </nav>
    </div>
  </Wrapper>
);

export default Navbar;
