import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink, RouterLinkActive } from '@angular/router';

interface MenuItem {
  section?: string;
  name?: string;
  icon?: string;
  route?: string;
  expanded?: boolean;
  submenu?: MenuItem[];
}

@Component({
  selector: 'app-sidebar',
  standalone: true,
  imports: [CommonModule, RouterLink, RouterLinkActive],
  templateUrl: './sidebar.component.html',
  styleUrls: ['./sidebar.component.css']
})
export class SidebarComponent {
  @Input() isCollapsed = false;
  @Output() toggleCollapse = new EventEmitter<void>();

  onToggleCollapse(): void {
    this.toggleCollapse.emit();
  }

  menuItems: MenuItem[] = [
    { name: 'Home', icon: 'home', route: '/dashboard' },
    { name: 'Masters', icon: 'database', expanded: false, submenu: [
      { name: 'General Masters' }
    ]},
    { name: 'Credentials', icon: 'key' },
    { name: 'Catalogues', icon: 'folder', expanded: false, submenu: [
      { name: 'Party' },
      { name: 'Party Type', route: '/catalogue' },
      { name: 'Price Catalogue' }
    ]},
    { name: 'Learn', icon: 'book' },
    { name: 'Reports', icon: 'bar-chart-2' },
    { name: 'GSTR', icon: 'file-text', expanded: false, submenu: [
      { name: 'GSTR 1' },
      { name: 'GSTR 2' }
    ]},
    { name: 'Transactions', icon: 'repeat', expanded: false, submenu: [
      { name: 'Invoice List', route: '/invoices' }
    ]},
    { name: 'Receipt & Payment', icon: 'arrow-left-right' },
    { name: 'Payment Management', icon: 'sliders', expanded: false, submenu: [
      { name: 'Payment Plans' }
    ]},
    { name: 'Tools', icon: 'tool' },
    { name: 'Workflow', icon: 'activity', expanded: false, submenu: [
      { name: 'Workflow List' }
    ]},
    { name: 'Business Entity', icon: 'briefcase' },
    { name: 'Business Entity Branch', icon: 'map-pin' },
    { name: 'Activity & Tracking', icon: 'navigation', expanded: false, submenu: [
      { name: 'Activity Log' }
    ]},
    { name: 'Settings', icon: 'settings' },
    { name: 'Approvals', icon: 'check-circle' },
    { name: 'Stock Audit', icon: 'clipboard' }
  ];

  toggleSubmenu(item: MenuItem): void {
    if (item.submenu) {
      item.expanded = !item.expanded;
    }
  }
}
