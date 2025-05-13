// Simple client-side router
const Router = {
  routes: {},

  init: function () {
    // Handle navigation
    window.addEventListener("hashchange", () => {
      this.handleRoute();
    });

    // Initial route handling
    this.handleRoute();
  },

  addRoute: function (path, controller) {
    this.routes[path] = controller;
  },

  handleRoute: function () {
    // Get current route from hash or default to home
    const currentPath = window.location.hash.slice(1) || "/";

    // Find the controller for the current path
    const controller = this.routes[currentPath];

    if (controller) {
      controller();
    } else {
      // Default route if not found
      if (this.routes["/"]) {
        this.routes["/"]();
      } else {
        console.error("Route not found and no default route defined");
      }
    }
  },
};
