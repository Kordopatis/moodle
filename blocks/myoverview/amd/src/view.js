// This file is part of Moodle - http://moodle.org/
//
// Moodle is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// Moodle is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU General Public License for more details.
//
// You should have received a copy of the GNU General Public License
// along with Moodle.  If not, see <http://www.gnu.org/licenses/>.

/**
 * Manage the courses view for the overview block.
 *
 * @package    block_myoverview
 * @copyright  2018 Bas Brands <bas@moodle.com>
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

define(
[
    'jquery',
    'block_myoverview/repository',
    'core/paged_content_factory',
    'core/pubsub',
    'core/custom_interaction_events',
    'core/notification',
    'core/templates',
    'core_course/events',
    'block_myoverview/selectors'
],
function(
    $,
    Repository,
    PagedContentFactory,
    PubSub,
    CustomEvents,
    Notification,
    Templates,
    CourseEvents,
    Selectors
) {

    var SELECTORS = {
        COURSE_REGION: '[data-region="course-view-content"]',
        ACTION_HIDE_COURSE: '[data-action="hide-course"]',
        ACTION_SHOW_COURSE: '[data-action="show-course"]',
        ACTION_ADD_FAVOURITE: '[data-action="add-favourite"]',
        ACTION_REMOVE_FAVOURITE: '[data-action="remove-favourite"]',
        FAVOURITE_ICON: '[data-region="favourite-icon"]',
        ICON_IS_FAVOURITE: '[data-region="is-favourite"]',
        ICON_NOT_FAVOURITE: '[data-region="not-favourite"]',
        PAGED_CONTENT_CONTAINER: '[data-region="page-container"]'

    };

    var TEMPLATES = {
        COURSES_CARDS: 'block_myoverview/view-cards',
        COURSES_LIST: 'block_myoverview/view-list',
        COURSES_SUMMARY: 'block_myoverview/view-summary',
        NOCOURSES: 'block_myoverview/no-courses'
    };

    var NUMCOURSES_PERPAGE = [12, 24, 48];

    var loadedPages = [];

    var courseOffset = 0;

    var lastPage = 0;

    var lastLimit = 0;

    /**
     * Get filter values from DOM.
     *
     * @param {object} root The root element for the courses view.
     * @return {filters} Set filters.
     */
    var getFilterValues = function(root) {
        var courseRegion = root.find(Selectors.courseView.region);
        return {
            display: courseRegion.attr('data-display'),
            grouping: courseRegion.attr('data-grouping'),
            sort: courseRegion.attr('data-sort')
        };
    };

    // We want the paged content controls below the paged content area.
    // and the controls should be ignored while data is loading.
    var DEFAULT_PAGED_CONTENT_CONFIG = {
        ignoreControlWhileLoading: true,
        controlPlacementBottom: true,
    };

    /**
     * Get enrolled courses from backend.
     *
     * @param {object} filters The filters for this view.
     * @param {int} limit The number of courses to show.
     * @return {promise} Resolved with an array of courses.
     */
    var getMyCourses = function(filters, limit) {

        return Repository.getEnrolledCoursesByTimeline({
            offset: courseOffset,
            limit: limit,
            classification: filters.grouping,
            sort: filters.sort
        });
    };

    /**
     * Get the container element for the favourite icon.
     *
     * @param  {Object} root The course overview container
     * @param  {Number} courseId Course id number
     * @return {Object} The favourite icon container
     */
    var getFavouriteIconContainer = function(root, courseId) {
        return root.find(SELECTORS.FAVOURITE_ICON + '[data-course-id="' + courseId + '"]');
    };

    /**
     * Get the paged content container element.
     *
     * @param  {Object} root The course overview container
     * @param  {Number} index Rendered page index.
     * @return {Object} The rendered paged container.
     */
    var getPagedContentContainer = function(root, index) {
        return root.find('[data-region="paged-content-page"][data-page="' + index + '"]');
    };

    /**
     * Get the course id from a favourite element.
     *
     * @param {Object} root The favourite icon container element.
     * @return {Number} Course id.
     */
    var getCourseId = function(root) {
        return root.attr('data-course-id');
    };

    /**
     * Hide the favourite icon.
     *
     * @param {Object} root The favourite icon container element.
     * @param  {Number} courseId Course id number.
     */
    var hideFavouriteIcon = function(root, courseId) {
        var iconContainer = getFavouriteIconContainer(root, courseId);
        var isFavouriteIcon = iconContainer.find(SELECTORS.ICON_IS_FAVOURITE);
        isFavouriteIcon.addClass('hidden');
        isFavouriteIcon.attr('aria-hidden', true);
        var notFavourteIcon = iconContainer.find(SELECTORS.ICON_NOT_FAVOURITE);
        notFavourteIcon.removeClass('hidden');
        notFavourteIcon.attr('aria-hidden', false);
    };

    /**
     * Show the favourite icon.
     *
     * @param  {Object} root The course overview container.
     * @param  {Number} courseId Course id number.
     */
    var showFavouriteIcon = function(root, courseId) {
        var iconContainer = getFavouriteIconContainer(root, courseId);
        var isFavouriteIcon = iconContainer.find(SELECTORS.ICON_IS_FAVOURITE);
        isFavouriteIcon.removeClass('hidden');
        isFavouriteIcon.attr('aria-hidden', false);
        var notFavourteIcon = iconContainer.find(SELECTORS.ICON_NOT_FAVOURITE);
        notFavourteIcon.addClass('hidden');
        notFavourteIcon.attr('aria-hidden', true);
    };

    /**
     * Get the action menu item
     *
     * @param {Object} root  root The course overview container
     * @param {Number} courseId Course id.
     * @return {Object} The add to favourite menu item.
     */
    var getAddFavouriteMenuItem = function(root, courseId) {
        return root.find('[data-action="add-favourite"][data-course-id="' + courseId + '"]');
    };

    /**
     * Get the action menu item
     *
     * @param {Object} root  root The course overview container
     * @param {Number} courseId Course id.
     * @return {Object} The remove from favourites menu item.
     */
    var getRemoveFavouriteMenuItem = function(root, courseId) {
        return root.find('[data-action="remove-favourite"][data-course-id="' + courseId + '"]');
    };

    /**
     * Add course to favourites
     *
     * @param  {Object} root The course overview container
     * @param  {Number} courseId Course id number
     */
    var addToFavourites = function(root, courseId) {
        var removeAction = getRemoveFavouriteMenuItem(root, courseId);
        var addAction = getAddFavouriteMenuItem(root, courseId);

        setCourseFavouriteState(courseId, true).then(function(success) {
            if (success) {
                PubSub.publish(CourseEvents.favourited);
                removeAction.removeClass('hidden');
                addAction.addClass('hidden');
                showFavouriteIcon(root, courseId);
            } else {
                Notification.alert('Starring course failed', 'Could not change favourite state');
            }
            return;
        }).catch(Notification.exception);
    };

    /**
     * Remove course from favourites
     *
     * @param  {Object} root The course overview container
     * @param  {Number} courseId Course id number
     */
    var removeFromFavourites = function(root, courseId) {
        var removeAction = getRemoveFavouriteMenuItem(root, courseId);
        var addAction = getAddFavouriteMenuItem(root, courseId);

        setCourseFavouriteState(courseId, false).then(function(success) {
            if (success) {
                PubSub.publish(CourseEvents.unfavorited);
                removeAction.addClass('hidden');
                addAction.removeClass('hidden');
                hideFavouriteIcon(root, courseId);
            } else {
                Notification.alert('Starring course failed', 'Could not change favourite state');
            }
            return;
        }).catch(Notification.exception);
    };

    /**
     * Reset the loadedPages dataset to take into account the hidden element
     *
     * @param {Object} root The course overview container
     * @param {Object} target The course that you want to hide
     */
    var hideElement = function(root, target) {
        var id = getCourseId(target);

        var pagingBar = root.find('[data-region="paging-bar"]');
        var jumpto = parseInt(pagingBar.attr('data-active-page-number'));

        // Get a reduced dataset for the current page.
        var courseList = loadedPages[jumpto];
        var reducedCourse = courseList.courses.reduce(function(accumulator, current) {
            if (id != current.id) {
                accumulator.push(current);
            }
            return accumulator;
        }, []);

        // Get the next page's data if loaded and pop the first element from it
        if (loadedPages[jumpto + 1] != undefined) {
            var newElement = loadedPages[jumpto + 1].courses.slice(0, 1);

            // Adjust the dataset for the reset of the pages that are loaded
            loadedPages.forEach(function(courseList, index) {
                if (index > jumpto) {
                    var popElement = [];
                    if (loadedPages[index + 1] != undefined) {
                        popElement = loadedPages[index + 1].courses.slice(0, 1);
                    }

                    loadedPages[index].courses = $.merge(loadedPages[index].courses.slice(1), popElement);
                }
            });


            reducedCourse = $.merge(reducedCourse, newElement);
        }

        // Check if the next page is the last page and if it still has data associated to it
        if (lastPage == jumpto + 1 && loadedPages[jumpto + 1].courses.length == 0) {
            var pagedContentContainer = root.find('[data-region="paged-content-container"]');
            PagedContentFactory.resetLastPageNumber($(pagedContentContainer).attr('id'), jumpto);
        }

        loadedPages[jumpto].courses = reducedCourse;

        // Reduce the course offset
        courseOffset--;

        // Render the paged content for the current
        var pagedContentPage = getPagedContentContainer(root, jumpto);
        renderCourses(root, loadedPages[jumpto]).then(function(html, js) {
            return Templates.replaceNodeContents(pagedContentPage, html, js);
        }).catch(Notification.exception);

        // Delete subsequent pages in order to trigger the callback
        loadedPages.forEach(function(courseList, index) {
            if (index > jumpto) {
                var page = getPagedContentContainer(root, index);
                page.remove();
            }
        });
    };

    /**
     * Set the courses favourite status and push to repository
     *
     * @param  {Number} courseId Course id to favourite.
     * @param  {Bool} status new favourite status.
     * @return {Promise} Repository promise.
     */
    var setCourseFavouriteState = function(courseId, status) {

        return Repository.setFavouriteCourses({
            courses: [
                    {
                        'id': courseId,
                        'favourite': status
                    }
                ]
        }).then(function(result) {
            if (result.warnings.length == 0) {
                loadedPages.forEach(function(courseList) {
                    courseList.courses.forEach(function(course, index) {
                        if (course.id == courseId) {
                            courseList.courses[index].isfavourite = status;
                        }
                    });
                });
                return true;
            } else {
                return false;
            }
        }).catch(Notification.exception);
    };

    /**
     * Render the dashboard courses.
     *
     * @param {object} root The root element for the courses view.
     * @param {array} coursesData containing array of returned courses.
     * @return {promise} jQuery promise resolved after rendering is complete.
     */
    var renderCourses = function(root, coursesData) {

        var filters = getFilterValues(root);

        var currentTemplate = '';
        if (filters.display == 'cards') {
            currentTemplate = TEMPLATES.COURSES_CARDS;
        } else if (filters.display == 'list') {
            currentTemplate = TEMPLATES.COURSES_LIST;
        } else {
            currentTemplate = TEMPLATES.COURSES_SUMMARY;
        }

        if (coursesData.courses.length) {
            return Templates.render(currentTemplate, {
                courses: coursesData.courses
            });
        } else {
            var nocoursesimg = root.find(Selectors.courseView.region).attr('data-nocoursesimg');
            return Templates.render(TEMPLATES.NOCOURSES, {
                nocoursesimg: nocoursesimg
            });
        }
    };

    /**
     * Intialise the paged list and cards views on page load.
     *
     * @param {object} root The root element for the courses view.
     * @param {object} content The content element for the courses view.
     */
    var initializePagedContent = function(root) {
        var filters = getFilterValues(root);

        var pagedContentPromise = PagedContentFactory.createWithLimit(
            NUMCOURSES_PERPAGE,
            function(pagesData, actions) {
                var promises = [];

                pagesData.forEach(function(pageData) {
                    var currentPage = pageData.pageNumber;
                    var limit = pageData.limit;

                    // Reset local variables if limits have changed
                    if (lastLimit != limit) {
                        loadedPages = [];
                        courseOffset = 0;
                        lastPage = 0;
                    }

                    if (lastPage == currentPage) {
                        // If we are on the last page and have it's data then load it from cache
                        actions.allItemsLoaded(lastPage);
                        promises.push(renderCourses(root, loadedPages[currentPage]));
                        return;
                    }

                    lastLimit = limit;

                    // Get 2 pages worth of data as we will need it for the hidden functionality.
                    if (loadedPages[currentPage + 1] == undefined) {
                        if (loadedPages[currentPage] == undefined) {
                            limit *= 2;
                        }
                    }

                    var pagePromise = getMyCourses(
                        filters,
                        limit
                    ).then(function(coursesData) {
                        var courses = coursesData.courses;
                        var nextPageStart = 0;
                        var pageCourses = [];

                        // If current page's data is loaded make sure we max it to page limit
                        if (loadedPages[currentPage] != undefined) {
                            pageCourses = loadedPages[currentPage].courses;
                            var currentPageLength = pageCourses.length;
                            if (currentPageLength < pageData.limit) {
                                nextPageStart = pageData.limit - currentPageLength;
                                pageCourses = $.merge(loadedPages[currentPage].courses, courses.slice(0, nextPageStart));
                            }
                        } else {
                            nextPageStart = pageData.limit;
                            pageCourses = courses.slice(0, pageData.limit);
                        }

                        // Finished setting up the current page
                        loadedPages[currentPage] = {
                            courses: pageCourses
                        };

                        // Set up the next page
                        var remainingCourses = courses.slice(nextPageStart, courses.length);
                        if (remainingCourses.length) {
                            loadedPages[currentPage + 1] = {
                                courses: remainingCourses
                            };
                        }

                        // Set the last page to either the current or next page
                        if (loadedPages[currentPage].courses.length < pageData.limit) {
                            lastPage = currentPage;
                            actions.allItemsLoaded(currentPage);
                        } else if (loadedPages[currentPage + 1] != undefined
                            && loadedPages[currentPage + 1].courses.length < pageData.limit) {
                            lastPage = currentPage + 1;
                        }

                        courseOffset = coursesData.nextoffset;
                        return renderCourses(root, loadedPages[currentPage]);
                    })
                    .catch(Notification.exception);

                    promises.push(pagePromise);
                });

                return promises;
            },
            DEFAULT_PAGED_CONTENT_CONFIG
        );

        pagedContentPromise.then(function(html, js) {
            return Templates.replaceNodeContents(root.find(Selectors.courseView.region), html, js);
        }).catch(Notification.exception);
    };

    /**
     * Listen to, and handle events for  the myoverview block.
     *
     * @param {Object} root The myoverview block container element.
     */
    var registerEventListeners = function(root) {
        CustomEvents.define(root, [
            CustomEvents.events.activate
        ]);

        root.on(CustomEvents.events.activate, SELECTORS.ACTION_ADD_FAVOURITE, function(e, data) {
            var favourite = $(e.target).closest(SELECTORS.ACTION_ADD_FAVOURITE);
            var courseId = getCourseId(favourite);
            addToFavourites(root, courseId);
            data.originalEvent.preventDefault();
        });

        root.on(CustomEvents.events.activate, SELECTORS.ACTION_REMOVE_FAVOURITE, function(e, data) {
            var favourite = $(e.target).closest(SELECTORS.ACTION_REMOVE_FAVOURITE);
            var courseId = getCourseId(favourite);
            removeFromFavourites(root, courseId);
            data.originalEvent.preventDefault();
        });

        root.on(CustomEvents.events.activate, SELECTORS.FAVOURITE_ICON, function(e, data) {
            data.originalEvent.preventDefault();
        });

        root.on(CustomEvents.events.activate, SELECTORS.ACTION_HIDE_COURSE, function(e, data) {
            var target = $(e.target).closest(SELECTORS.ACTION_HIDE_COURSE);
            var id = getCourseId(target);

            var request = {
                preferences: [
                    {
                        type: 'block_myoverview_hidden_course_' + id,
                        value: true
                    }
                ]
            };
            Repository.updateUserPreferences(request);

            hideElement(root, target);
            data.originalEvent.preventDefault();
        });

        root.on(CustomEvents.events.activate, SELECTORS.ACTION_SHOW_COURSE, function(e, data) {
            var target = $(e.target).closest(SELECTORS.ACTION_SHOW_COURSE);
            var id = getCourseId(target);

            var request = {
                preferences: [
                    {
                        type: 'block_myoverview_hidden_course_' + id,
                        value: null
                    }
                ]
            };

            Repository.updateUserPreferences(request);

            hideElement(root, target);
            data.originalEvent.preventDefault();
        });
    };

    /**
     * Intialise the courses list and cards views on page load.
     *
     * @param {object} root The root element for the courses view.
     */
    var init = function(root) {
        root = $(root);
        loadedPages = [];
        lastPage = 0;
        courseOffset = 0;

        if (!root.attr('data-init')) {
            registerEventListeners(root);
            root.attr('data-init', true);
        }

        initializePagedContent(root);
    };

    /**

     * Reset the courses views to their original
     * state on first page load.courseOffset
     *
     * This is called when configuration has changed for the event lists
     * to cause them to reload their data.
     *
     * @param {Object} root The root element for the timeline view.
     */
    var reset = function(root) {
        if (loadedPages.length > 0) {
            loadedPages.forEach(function(courseList, index) {
                var pagedContentPage = getPagedContentContainer(root, index);
                renderCourses(root, courseList).then(function(html, js) {
                    return Templates.replaceNodeContents(pagedContentPage, html, js);
                }).catch(Notification.exception);
            });
        } else {
            init(root);
        }
    };

    return {
        init: init,
        reset: reset
    };
});
