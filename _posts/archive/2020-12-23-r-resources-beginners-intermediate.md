---
title: 'R Resources for Beginners and Intermediate Users'
date: 2021-01-03
permalink: 2021/01/r_resources_beginners_intermediate/
excerpt: An R resources repository for beginners and intermediate users
---

<!--more-->

I was lucky enough to get started with R before the start of my PhD. I'd used it regularly during my year at <a href="https://www.idinsight.org/" target="_blank">IDinsight</a>, which made it a lot easier to get through the first semester (we used R mostly for our applied statistics course).

If you've never used R and are starting a PhD in a social science in a few months, or planning to apply to a PhD, going through some of the tutorials and resources below would be a great way to spend some of your time.

Here is a list of **free resources to learn R** that may be useful for people getting started. I'll try to keep this page updated as I come across more resources. Send helpful links my way on Twitter or in the comments of this post, and I'll add them if they complement what's already here.


## First steps with R

If you are a **first-time R user**, thee first book below will also guide you through the pieces of software (R and RStudio) needed to work with R.

<div style="text-align:center">
  <img src="https://res.cloudinary.com/dt1gua70y/image/upload/v1609265872/R_screenshot_13.05.58_tfvsj4.png" alt="Screenshot of the RStudio Interface" style="width:90%">
</div>
<center>The RStudio Interface</center>

* <a href="https://rstudio-education.github.io/hopr/" target="_blank">Hands-On Programming with R</a>: a very helpful book, available for free online, introducing the basics of **R programming**. It doesn't teach you how to manipulate, analyze, or visualize data, but it guides you through R object types, subsetting, loops, functions, etc. It entirely uses **base R** (the set of functions that come with the packages deployed with R by default).

* <a href="https://r4ds.had.co.nz" target="_blank">R for Data Science</a> (**r4ds**): one of the best introductions to working with data in R (also available for free online). This book teaches you the basic of data manipulation (wrangling), visualization, and analysis. It uses code from the **tidyverse** (a set of packages designed to work together, primarily with *tidy* datasets, in which each row is an observation and is column is a variable). As I mention below, **r4ds** users form a community that is a great source of support to learn R. The book was authored by <a href="https://twitter.com/hadleywickham" target="_blank">Hadley Wickham</a>, who is a big name in the R community: he has created the tidyverse and is Chief Scientist at <a href="https://rstudio.com/" target="_blank">RStudio</a>.

## Data visualization with R

* <a href="https://r4ds.had.co.nz/data-visualisation.html" target="_blank">ggplot (chapter 3 of r4ds)</a>: ggplot is my favorite tool for data visualization. It uses an intuitive framework called the **grammar of graphics** ('gg' in 'ggplot'). The best introduction to ggplot is in chapter 3 of the book r4ds mentioned above, which introduces both the logic of the grammar of graphics and the functions used.

* **Thomas Lin Pedersen's ggplot workshop** (<a href="https://www.youtube.com/watch?v=h29g21z0a68&feature=youtu.be" target="_blank">part 1</a> and <a href="https://www.youtube.com/watch?v=0m4yywqNPVY&feature=youtu.be" target="_blank">part 2</a>): this is an amazing way to spend 4 hours to better understand ggplot and the grammar of graphics. <a href="https://twitter.com/thomasp85" target="_blank">Thomas Lin Pedersen</a> is also a pretty big name: he has created or maintained some of the main tidyverse packages and makes <a href="https://www.data-imaginist.com/art" target="_blank">cool generative art with R</a>.

* <a href="https://www.r-graph-gallery.com" target="_blank">The R Graph Gallery</a>: this website is a great source of inspiration for cool data visualizations. It guides through the code required to make a wide variety of plots with R, alternatively using base R, the tidyverse, and alternative packages. It also explains how to <a href="https://www.r-graph-gallery.com/animation.html" target="_blank">animate your plots</a> and <a href="https://www.r-graph-gallery.com/interactive-charts.html" target="_blank">make your plots interactive</a>.

<div align="center"><iframe src="/files/base_map_demo.html" width="75%" height="300"></iframe></div>
<center>Example of an interactive map made with R</center>

## R Workflows

* <a href="https://r4ds.had.co.nz/r-markdown.html" target="_blank">R Markdown (chapter 27 of r4ds)</a>: R Markdown provides an easy way to produce formatted PDF or HTML that include both your code and its output. The logic of R Markdown is to facilitate the **reproducibility** of your code, by alternating text explanations, code, and code outputs. It's a way for you to communicate your work to other people, or to your future self (as you may have forgotten what you did after a few months). An extra benefit from learning R Markdown is that the same syntax can be used to write a book or publish a website (like this one) using the <a href="https://bookdown.org/" target="_blank">bookdown</a> or <a href="https://bookdown.org/yihui/blogdown/" target="_blank">blogdown</a> packages.

* <a href="https://happygitwithr.com/" target="_blank">Happy Git with R</a>: if you've never heard of it before, **version control** is a set of systems used to track changes and find previous versions of your code. You can think of it as a combination of the 'track changes' tool on Microsoft Word and the 'version history' on Google Docs. **Git** is probably the most famous of such systems, and **GitHub** (owned by Microsoft since 2018) the most used platform offering version control with Git. Version control is definitely the best way to collaborate on projects involving R code. **Happy Git with R** is a book available for free online that introduces version control from RStudio and guides you through the required setup.

<div style="text-align:center">
  <img src="https://res.cloudinary.com/dt1gua70y/image/upload/v1609713466/github-octocat_t31wgf.png" alt="The GitHub 'octocat'" style="width:60%">
</div>
<center>The GitHub 'octocat'</center>


## Building and Hosting Interactive Apps with R Shiny

* <a href="https://shiny.rstudio.com/tutorial/" target="_blank">Introduction to Shiny</a>: once you know the basics of data manipulation and visualization, R provides an easy way to create **interactive apps**. My <a href="https://martindevaux.com/2020/11/political-science-phd-admission-decisions/" target="_blank">Political Science PhD application decisions tracker</a> is a simple example, but Shiny apps can be <a href="https://shiny.rstudio.com/gallery/" target="_blank">full-grown dashboards</a>. The tutorials on this page are straightforward if you are comfortable with data visualization, and will allow you to build an deploy a mock app quickly. Various solutions to host your app online exist and are described at the end of the tutorials.

* More Shiny resources: the <a href="https://rstudio.github.io/shinydashboard/get_started.html" target="_blank">shinydashboard</a> and <a href="https://rinterface.github.io/shinydashboardPlus/" target="_blank">shinydashboardplus</a> packages are easy ways to turn your Shiny app into a nice- and professional-looking dashboard. <a href="https://divadnojnarg.github.io/outstanding-shiny-ui/" target="_blank">Building Outstanding User Interfaces with Shiny</a> teaches how to go further in the design aspect of the Shiny app creation.


## Resources for Intermediate Users - Where to Look to Go Further?

* <a href="https://adv-r.hadley.nz/index.html" target="_blank">Advanced R</a>: another free book by Hadley Wickham. Rather than reading it cover-to-cover, it's a good idea to go through specific chapters as you want to understand some aspect of R better (how functional programming works, how to make your code more efficient, etc.).


* **And more**: <a href="https://r-pkgs.org/" target="_blank">R Packages</a> to make your own packages, <a href="https://bookdown.org/yihui/blogdown/" target="_blank">Blogdown</a> (already mentioned above) to build a website or a blog with R, etc.

**Send me a message on [Twitter](https://twitter.com/MartinDevaux) or comment on this post if you know of helpful resources to add to this list.**