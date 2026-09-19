export default function StatsSection() {
    return (
        <section id="about">
            <div className="bg-muted/50 py-24">
                <div className="mx-auto max-w-5xl px-6">
                    <div>
                        <h2 className="text-4xl font-semibold lg:text-5xl">Why Choose WorkSync?</h2>
                        <p className="text-muted-foreground mt-4 text-balance text-lg">Our platform continues to grow with developers and businesses using our tools to create innovative solutions and enhance productivity.</p>
                    </div>
                    <div className="mt-8 grid grid-cols-2 gap-4 md:mt-16 md:grid-cols-4">
                        <div>
                            <div className="text-foreground text-2xl font-semibold">Discover</div>
                            <p className="text-muted-foreground">Find freelance services</p>
                        </div>
                        <div>
                            <div className="text-foreground text-2xl font-semibold">Agree</div>
                            <p className="text-muted-foreground">Define scope and milestones</p>
                        </div>
                        <div>
                            <div className="text-foreground text-2xl font-semibold">Work</div>
                            <p className="text-muted-foreground">Share updates and feedback</p>
                        </div>
                        <div>
                            <div className="text-foreground text-2xl font-semibold">Deliver</div>
                            <p className="text-muted-foreground">Review and approve work</p>
                        </div>
                    </div>
                </div>
            </div>
        </section>
    )
}
